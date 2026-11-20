-- =============================================================================
-- Mortgage Loan File Review: Snowflake setup
-- Synthetic data only. Illustrative logic; not underwriting, credit, legal, regulatory,
-- or compliance advice.
--
-- Run top to bottom in a Snowsight SQL worksheet. Most of the time is the first pass of
-- the document pipeline over 512 bundled PDFs (see README for the measured time).
-- Requirements (see README): a Snowflake account where Cortex AI functions and Cortex
-- Search are available natively or through cross-region inference, and ACCOUNTADMIN (or a
-- role that can create roles, warehouses, databases, API integrations, and grant EXECUTE TASK).
--
-- Creates (and sql/cleanup.sql drops):
--   role         LOAN_REVIEW_DEMO_ROLE (owns everything below)
--   warehouse    LOAN_REVIEW_WH (XSMALL, AUTO_SUSPEND = 60)
--   database     LOAN_REVIEW_DEMO (schemas LOANS, APP)
--   integration  LOAN_REVIEW_GIT_API (read-only access to the public example repository)
-- It changes nothing that already exists.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1. Account-level objects (ACCOUNTADMIN)
-- -----------------------------------------------------------------------------
USE ROLE ACCOUNTADMIN;

CREATE ROLE IF NOT EXISTS LOAN_REVIEW_DEMO_ROLE COMMENT = 'Mortgage Loan File Review example: least-privilege owner role';
GRANT ROLE LOAN_REVIEW_DEMO_ROLE TO ROLE SYSADMIN;
SET my_user = CURRENT_USER();
GRANT ROLE LOAN_REVIEW_DEMO_ROLE TO USER IDENTIFIER($my_user);

CREATE WAREHOUSE IF NOT EXISTS LOAN_REVIEW_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Mortgage Loan File Review example';
GRANT OWNERSHIP ON WAREHOUSE LOAN_REVIEW_WH TO ROLE LOAN_REVIEW_DEMO_ROLE;

CREATE DATABASE IF NOT EXISTS LOAN_REVIEW_DEMO COMMENT = 'Mortgage Loan File Review example (synthetic data)';
GRANT OWNERSHIP ON DATABASE LOAN_REVIEW_DEMO TO ROLE LOAN_REVIEW_DEMO_ROLE;

-- Cortex AI functions and Cortex Search, and the right to run the pipeline task.
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE LOAN_REVIEW_DEMO_ROLE;
GRANT EXECUTE TASK ON ACCOUNT TO ROLE LOAN_REVIEW_DEMO_ROLE;

-- Read-only access to the public GitHub repository that holds the synthetic files.
CREATE API INTEGRATION IF NOT EXISTS LOAN_REVIEW_GIT_API
  API_PROVIDER = git_https_api
  API_ALLOWED_PREFIXES = ('https://github.com/sfc-gh-ooral/')
  ENABLED = TRUE
  COMMENT = 'Mortgage Loan File Review example: public repo, no credentials';
GRANT USAGE ON INTEGRATION LOAN_REVIEW_GIT_API TO ROLE LOAN_REVIEW_DEMO_ROLE;

-- -----------------------------------------------------------------------------
-- Part 2. Everything else runs as the least-privilege owner role.
-- -----------------------------------------------------------------------------
USE ROLE LOAN_REVIEW_DEMO_ROLE;
USE WAREHOUSE LOAN_REVIEW_WH;
USE DATABASE LOAN_REVIEW_DEMO;
CREATE SCHEMA IF NOT EXISTS LOANS COMMENT = 'Loans, borrower documents, conditions and AI pipeline output (synthetic)';
CREATE SCHEMA IF NOT EXISTS APP   COMMENT = 'Processor and QC decisions written by the app';
USE SCHEMA LOANS;

-- 2a. Reference tables from the public repository ----------------------------
CREATE OR REPLACE GIT REPOSITORY LOAN_REPO
  API_INTEGRATION = LOAN_REVIEW_GIT_API
  ORIGIN = 'https://github.com/sfc-gh-ooral/sfguide-loan-file-review.git';
ALTER GIT REPOSITORY LOAN_REPO FETCH;
CREATE OR REPLACE STAGE LOAN_SEED COMMENT = 'Synthetic CSVs copied from the repository';
COPY FILES INTO @LOAN_SEED FROM @LOAN_REPO/branches/main/data/csv/;

CREATE OR REPLACE FILE FORMAT LOAN_CSV TYPE = CSV PARSE_HEADER = TRUE FIELD_OPTIONALLY_ENCLOSED_BY = '"'
  NULL_IF = ('') EMPTY_FIELD_AS_NULL = TRUE;

CREATE OR REPLACE TABLE LOANS (
  loan_id STRING, borrower_name STRING, property_address STRING, loan_amount NUMBER(12,2), estimated_value NUMBER(12,2),
  purpose STRING, program STRING, interest_rate NUMBER(6,3), stage STRING, application_date DATE, target_close_date DATE,
  closed_date DATE, processor STRING, stated_employer STRING, stated_monthly_income NUMBER(12,2), story STRING);
CREATE OR REPLACE TABLE CONDITIONS (
  condition_id STRING, loan_id STRING, category STRING, description STRING, status STRING, source STRING,
  opened_at DATE, cleared_at DATE);
CREATE OR REPLACE TABLE QC_FINDINGS (
  finding_id STRING, loan_id STRING, review_month DATE, finding_type STRING, severity STRING, description STRING);
-- Intake manifest: which loan each incoming file belongs to. LABELED_DOC_TYPE is the generator's
-- label, kept only to measure AI_CLASSIFY; the pipeline never reads it.
CREATE OR REPLACE TABLE DOCUMENTS (doc_id STRING, loan_id STRING, labeled_doc_type STRING, file_name STRING,
  received_at TIMESTAMP_NTZ, source STRING);

COPY INTO LOANS       FROM @LOAN_SEED/loans.csv       FILE_FORMAT = (FORMAT_NAME = LOAN_CSV) MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO CONDITIONS  FROM @LOAN_SEED/conditions.csv  FILE_FORMAT = (FORMAT_NAME = LOAN_CSV) MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO QC_FINDINGS FROM @LOAN_SEED/qc_findings.csv FILE_FORMAT = (FORMAT_NAME = LOAN_CSV) MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;
COPY INTO DOCUMENTS (doc_id, loan_id, labeled_doc_type, file_name, received_at, source)
  FROM (SELECT $1, $2, $3, $4, $5, $6 FROM @LOAN_SEED/documents.csv)
  FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1 FIELD_OPTIONALLY_ENCLOSED_BY = '"');

-- Business clock and credit policy. Edit CREDIT_POLICY to match your own tolerances; the
-- checks below read it, so changing a threshold changes which loans fail.
CREATE OR REPLACE TABLE CONFIG (as_of_date DATE);
INSERT INTO CONFIG VALUES ('2026-11-19');
CREATE OR REPLACE TABLE CREDIT_POLICY (rule_id STRING, rule_name STRING, threshold FLOAT, description STRING);
INSERT INTO CREDIT_POLICY VALUES
  ('income',    'Stated income vs pay stub',   0.05, 'Application income may exceed the income verified from the latest pay stub by at most this fraction'),
  ('deposit',   'Large deposit',               0.50, 'A non-payroll deposit above this fraction of verified monthly income needs a sourced explanation'),
  ('appraisal', 'Appraisal age at closing',    120,  'Maximum days from the appraisal effective date to the target closing date'),
  ('value',     'Appraised value vs estimate', 0.05, 'Appraised value may fall below the application estimate by at most this fraction'),
  ('amount',    'Loan amount',                 1,    'Loan amount on the closing disclosure or title commitment must match the application within this many dollars');

-- 2b. Document pipeline: stage + directory table + stream + task ---------------
-- New files land on LOAN_DOCS; the stream on its directory table queues them, and the task
-- runs PROCESS_NEW_DOCUMENTS whenever the stream has data.
CREATE OR REPLACE STAGE LOAN_DOCS ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE') DIRECTORY = (ENABLE = TRUE)
  COMMENT = 'Incoming borrower documents (applications, pay stubs, W-2s, bank statements, appraisals, title, closing disclosures)';
CREATE OR REPLACE STREAM LOAN_DOCS_STREAM ON STAGE LOAN_DOCS;

CREATE OR REPLACE TABLE DOC_QUEUE (relative_path STRING, queued_at TIMESTAMP_NTZ, processed BOOLEAN);
CREATE OR REPLACE TABLE DOC_PARSED (
  doc_id STRING, file_name STRING, parsed_text STRING, page_count NUMBER, doc_type STRING, processed_at TIMESTAMP_NTZ);
CREATE OR REPLACE TABLE DOC_FIELDS (doc_id STRING, doc_type STRING, fields VARIANT, scores VARIANT,
  min_score FLOAT, line_items VARIANT, extracted_at TIMESTAMP_NTZ);
CREATE OR REPLACE TABLE QC_REVIEWS (loan_id STRING, facts STRING, narrative STRING, model STRING, generated_at TIMESTAMP_NTZ);
CREATE TABLE IF NOT EXISTS APP.LOAN_ACTIONS (action_id STRING DEFAULT UUID_STRING(), loan_id STRING, action STRING,
  condition_id STRING, comment STRING, message STRING,
  acted_by STRING DEFAULT CURRENT_USER(), acted_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP());

-- Field schemas per document type. AI_EXTRACT returns a value and a confidence score per field.
CREATE OR REPLACE TABLE EXTRACTION_SCHEMAS (doc_type STRING, response_format VARIANT, with_scores BOOLEAN);
INSERT INTO EXTRACTION_SCHEMAS
SELECT 'loan_application', PARSE_JSON('{
  "borrower_name":"Who is the borrower (full name)?",
  "property_address":"What is the subject property address?",
  "loan_purpose":"What is the loan purpose?",
  "loan_amount":"What is the loan amount, as a number without symbols?",
  "estimated_value":"What is the estimated property value, as a number without symbols?",
  "employer":"Who is the current employer?",
  "monthly_income":"What is the gross monthly base income, as a number without symbols?",
  "application_date":"What is the application date, as YYYY-MM-DD?"}'), TRUE
UNION ALL SELECT 'pay_stub', PARSE_JSON('{
  "employee_name":"Who is the employee?",
  "employer":"Who is the employer that issued this earnings statement?",
  "period_end":"What is the pay period ending date, as YYYY-MM-DD?",
  "pay_frequency":"What is the pay frequency? Answer one of weekly, biweekly, semimonthly, monthly.",
  "gross_pay":"What is the gross pay this period, as a number without symbols?",
  "ytd_gross":"What is the year-to-date gross pay, as a number without symbols?"}'), TRUE
UNION ALL SELECT 'w2', PARSE_JSON('{
  "employee_name":"What is the employee name?",
  "employer":"Who is the employer?",
  "tax_year":"What is the tax year?",
  "wages":"What is the amount in Box 1 wages, tips, other compensation, as a number without symbols?"}'), TRUE
UNION ALL SELECT 'appraisal', PARSE_JSON('{
  "property_address":"What is the subject property address?",
  "effective_date":"What is the effective date of the appraisal, as YYYY-MM-DD?",
  "appraised_value":"What is the opinion of market value, as a number without symbols?",
  "property_type":"What is the property type?",
  "appraiser":"Who is the appraiser?"}'), TRUE
UNION ALL SELECT 'title_commitment', PARSE_JSON('{
  "property_address":"What is the property address?",
  "commitment_date":"What is the commitment date, as YYYY-MM-DD?",
  "vested_owner":"In whom is title vested?",
  "insured_amount":"What is the proposed amount of insurance, as a number without symbols?"}'), TRUE
UNION ALL SELECT 'closing_disclosure', PARSE_JSON('{
  "borrower_name":"Who is the borrower?",
  "loan_amount":"What is the loan amount, as a number without symbols?",
  "interest_rate":"What is the interest rate, as a number without the percent sign?",
  "closing_date":"What is the closing date, as YYYY-MM-DD?",
  "cash_to_close":"What is the cash to close, as a number without symbols?"}'), TRUE
UNION ALL SELECT 'bank_statement', PARSE_JSON('{"schema":{"type":"object","properties":{
  "account_holder":{"description":"Who is the account holder?","type":"string"},
  "bank_name":{"description":"What is the name of the bank or credit union?","type":"string"},
  "statement_end":{"description":"What is the last date of the statement period, as YYYY-MM-DD?","type":"string"},
  "closing_balance":{"description":"What is the closing balance, as a number without symbols?","type":"string"},
  "deposits":{"description":"Deposits and credits","type":"object","column_ordering":["date","description","amount"],
    "properties":{"date":{"description":"Date","type":"array"},"description":{"description":"Description","type":"array"},
                  "amount":{"description":"Amount","type":"array"}}}}}}'), FALSE;

-- Numbers and dates as extracted are strings; these helpers normalize them.
CREATE OR REPLACE FUNCTION NUM(s STRING) RETURNS NUMBER(14,2) AS $$ TRY_TO_NUMBER(REGEXP_REPLACE(s, '[^0-9.]', ''), 14, 2) $$;

-- Deposits from every bank statement, one row each, with payroll deposits marked.
CREATE OR REPLACE VIEW LOAN_DEPOSITS AS
SELECT d.loan_id, x.doc_id, TRY_TO_DATE(x.line_items:date[v.index]::STRING) AS deposit_date,
       v.value::STRING AS description, NUM(x.line_items:amount[v.index]::STRING) AS amount,
       REGEXP_LIKE(v.value::STRING, '.*(PAYROLL|DIR DEP).*', 'i') AS is_payroll
FROM DOC_FIELDS x JOIN DOCUMENTS d ON d.doc_id = x.doc_id,
     LATERAL FLATTEN(input => x.line_items:description) v
WHERE x.doc_type = 'bank_statement';

-- Application values beside the values the documents support, one row per loan.
CREATE OR REPLACE VIEW LOAN_FACTS AS
WITH f AS (
  SELECT d.loan_id, x.doc_id, x.doc_type, x.fields, d.received_at
  FROM DOC_FIELDS x JOIN DOCUMENTS d ON d.doc_id = x.doc_id
), app AS (
  SELECT loan_id, ANY_VALUE(doc_id) AS app_doc, ANY_VALUE(fields:borrower_name::STRING) AS app_borrower,
         ANY_VALUE(fields:property_address::STRING) AS app_address, ANY_VALUE(NUM(fields:loan_amount::STRING)) AS app_amount,
         ANY_VALUE(NUM(fields:estimated_value::STRING)) AS app_value, ANY_VALUE(fields:employer::STRING) AS app_employer,
         ANY_VALUE(NUM(fields:monthly_income::STRING)) AS app_income
  FROM f WHERE doc_type = 'loan_application' GROUP BY loan_id
), stub AS (
  SELECT loan_id, doc_id AS stub_doc, fields:employee_name::STRING AS stub_name, fields:employer::STRING AS stub_employer,
         TRY_TO_DATE(fields:period_end::STRING) AS stub_period_end, LOWER(fields:pay_frequency::STRING) AS stub_frequency,
         NUM(fields:gross_pay::STRING) AS stub_gross,
         ROUND(NUM(fields:gross_pay::STRING) * CASE WHEN LOWER(fields:pay_frequency::STRING) LIKE '%semi%' THEN 24
                                                   WHEN LOWER(fields:pay_frequency::STRING) LIKE '%bi%' THEN 26
                                                   WHEN LOWER(fields:pay_frequency::STRING) LIKE '%week%' THEN 52 ELSE 12 END / 12, 2) AS verified_income
  FROM f WHERE doc_type = 'pay_stub'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY TRY_TO_DATE(fields:period_end::STRING) DESC NULLS LAST, doc_id DESC) = 1
), w2 AS (
  SELECT loan_id, doc_id AS w2_doc, TRY_TO_NUMBER(fields:tax_year::STRING) AS w2_year, NUM(fields:wages::STRING) AS w2_wages
  FROM f WHERE doc_type = 'w2'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY TRY_TO_NUMBER(fields:tax_year::STRING) DESC NULLS LAST) = 1
), bank AS (
  SELECT loan_id, ANY_VALUE(fields:account_holder::STRING) AS bank_holder FROM f WHERE doc_type = 'bank_statement' GROUP BY loan_id
), dep AS (
  SELECT loan_id, doc_id AS deposit_doc, amount AS largest_other_deposit, description AS largest_other_desc, deposit_date AS largest_other_date
  FROM LOAN_DEPOSITS WHERE NOT is_payroll
  QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY amount DESC) = 1
), appr AS (
  SELECT loan_id, doc_id AS appraisal_doc, TRY_TO_DATE(fields:effective_date::STRING) AS appraisal_date,
         NUM(fields:appraised_value::STRING) AS appraised_value, fields:property_address::STRING AS appraisal_address
  FROM f WHERE doc_type = 'appraisal' QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY received_at DESC) = 1
), title AS (
  SELECT loan_id, doc_id AS title_doc, NUM(fields:insured_amount::STRING) AS title_amount
  FROM f WHERE doc_type = 'title_commitment' QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY received_at DESC) = 1
), cd AS (
  SELECT loan_id, doc_id AS cd_doc, NUM(fields:loan_amount::STRING) AS cd_amount, TRY_TO_DATE(fields:closing_date::STRING) AS cd_close
  FROM f WHERE doc_type = 'closing_disclosure' QUALIFY ROW_NUMBER() OVER (PARTITION BY loan_id ORDER BY received_at DESC) = 1
)
SELECT l.loan_id, l.stage, l.target_close_date, app.*EXCLUDE loan_id, stub.*EXCLUDE loan_id, w2.*EXCLUDE loan_id,
       ROUND(w2.w2_wages / 12, 2) AS w2_monthly, bank.bank_holder, dep.*EXCLUDE loan_id, appr.*EXCLUDE loan_id,
       DATEDIFF('day', appr.appraisal_date, COALESCE(cd.cd_close, l.target_close_date)) AS appraisal_age_at_close,
       title.*EXCLUDE loan_id, cd.*EXCLUDE loan_id
FROM LOANS l
LEFT JOIN app ON app.loan_id = l.loan_id LEFT JOIN stub ON stub.loan_id = l.loan_id LEFT JOIN w2 ON w2.loan_id = l.loan_id
LEFT JOIN bank ON bank.loan_id = l.loan_id LEFT JOIN dep ON dep.loan_id = l.loan_id LEFT JOIN appr ON appr.loan_id = l.loan_id
LEFT JOIN title ON title.loan_id = l.loan_id LEFT JOIN cd ON cd.loan_id = l.loan_id;

-- Tolerance rules: application vs documents, one row per loan and check, with the source document.
-- Thresholds come from CREDIT_POLICY. Status is Pass, Fail, or Pending (document not received yet).
CREATE OR REPLACE VIEW LOAN_CHECKS AS
WITH p AS (SELECT OBJECT_AGG(rule_id, threshold::VARIANT) AS t FROM CREDIT_POLICY)
SELECT loan_id, 'income' AS check_id, 'Monthly income' AS check_name,
       app_income::STRING AS application_value, verified_income::STRING AS document_value, stub_doc AS source_doc, 'pay_stub' AS source_type,
       CASE WHEN verified_income IS NULL THEN 'Pending' WHEN app_income > verified_income * (1 + p.t:income::FLOAT) THEN 'Fail' ELSE 'Pass' END AS status,
       IFF(verified_income > 0, 'Application is ' || ROUND((app_income / verified_income - 1) * 100, 1) || '% vs the latest pay stub (' ||
           INITCAP(stub_frequency) || ' gross ' || stub_gross || '); W-2 ' || COALESCE(w2_year::STRING, '?') || ' supports ' || COALESCE(w2_monthly::STRING, '?') || '/mo', NULL) AS detail
FROM LOAN_FACTS, p
UNION ALL
SELECT loan_id, 'employer', 'Employer', app_employer, stub_employer, stub_doc, 'pay_stub',
       CASE WHEN stub_employer IS NULL THEN 'Pending' WHEN SPLIT_PART(UPPER(app_employer), ' ', 1) = SPLIT_PART(UPPER(stub_employer), ' ', 1) THEN 'Pass' ELSE 'Fail' END,
       'Employer on the application vs the issuer of the latest pay stub'
FROM LOAN_FACTS
UNION ALL
SELECT loan_id, 'borrower', 'Borrower name', app_borrower, COALESCE(stub_name, bank_holder), stub_doc, 'pay_stub',
       CASE WHEN stub_name IS NULL THEN 'Pending' WHEN EDITDISTANCE(UPPER(app_borrower), UPPER(stub_name)) <= 2
                 AND EDITDISTANCE(UPPER(app_borrower), UPPER(COALESCE(bank_holder, stub_name))) <= 2 THEN 'Pass' ELSE 'Fail' END,
       'Name on the application vs the pay stub and bank statements'
FROM LOAN_FACTS
UNION ALL
SELECT loan_id, 'deposit', 'Large deposits', ROUND(verified_income * p.t:deposit::FLOAT, 2)::STRING, largest_other_deposit::STRING, deposit_doc, 'bank_statement',
       CASE WHEN bank_holder IS NULL THEN 'Pending' WHEN COALESCE(largest_other_deposit, 0) > verified_income * p.t:deposit::FLOAT THEN 'Fail' ELSE 'Pass' END,
       IFF(largest_other_deposit IS NOT NULL, 'Largest non-payroll deposit: ' || largest_other_desc || ' on ' || largest_other_date ||
           '. Threshold is ' || ROUND(p.t:deposit::FLOAT * 100) || '% of verified monthly income', 'Payroll deposits only')
FROM LOAN_FACTS, p
UNION ALL
SELECT loan_id, 'appraisal', 'Appraisal age at closing', p.t:appraisal::INT || ' days max', appraisal_age_at_close::STRING, appraisal_doc, 'appraisal',
       CASE WHEN appraisal_date IS NULL THEN 'Pending' WHEN appraisal_age_at_close > p.t:appraisal::INT THEN 'Fail' ELSE 'Pass' END,
       IFF(appraisal_date IS NOT NULL, 'Effective ' || appraisal_date || ', ' || appraisal_age_at_close || ' days before closing on ' || COALESCE(cd_close, target_close_date), NULL)
FROM LOAN_FACTS, p
UNION ALL
SELECT loan_id, 'value', 'Appraised value', app_value::STRING, appraised_value::STRING, appraisal_doc, 'appraisal',
       CASE WHEN appraised_value IS NULL THEN 'Pending' WHEN appraised_value < app_value * (1 - p.t:value::FLOAT) THEN 'Fail' ELSE 'Pass' END,
       IFF(appraised_value > 0, 'Loan-to-value ' || ROUND(app_amount / appraised_value * 100, 1) || '% on the appraised value', NULL)
FROM LOAN_FACTS, p
UNION ALL
SELECT loan_id, 'amount', 'Loan amount', app_amount::STRING, COALESCE(cd_amount, title_amount)::STRING, COALESCE(cd_doc, title_doc),
       IFF(cd_doc IS NOT NULL, 'closing_disclosure', 'title_commitment'),
       CASE WHEN COALESCE(cd_amount, title_amount) IS NULL THEN 'Pending'
            WHEN ABS(app_amount - COALESCE(cd_amount, title_amount)) > p.t:amount::FLOAT THEN 'Fail' ELSE 'Pass' END,
       IFF(cd_doc IS NOT NULL, 'Application vs closing disclosure', 'Application vs title commitment insured amount')
FROM LOAN_FACTS, p
UNION ALL
SELECT loan_id, 'address', 'Property address', app_address, appraisal_address, appraisal_doc, 'appraisal',
       CASE WHEN appraisal_address IS NULL THEN 'Pending' WHEN EDITDISTANCE(UPPER(app_address), UPPER(appraisal_address)) <= 3 THEN 'Pass' ELSE 'Fail' END,
       'Subject property on the application vs the appraisal'
FROM LOAN_FACTS;

-- Required documents by stage, and what has arrived and been extracted.
CREATE OR REPLACE VIEW LOAN_CHECKLIST AS
WITH req AS (
  SELECT * FROM VALUES ('loan_application', 1, 0), ('pay_stub', 2, 0), ('w2', 1, 0), ('bank_statement', 2, 0),
    ('appraisal', 1, 1), ('title_commitment', 1, 1), ('closing_disclosure', 1, 3) AS v(doc_type, needed, from_stage)
), stage_no AS (
  SELECT loan_id, stage, DECODE(stage, 'Application', 0, 'Processing', 1, 'Underwriting', 2, 'Conditional approval', 3,
                                'Clear to close', 4, 'Closed', 5) AS n FROM LOANS
)
SELECT s.loan_id, r.doc_type, r.needed, r.from_stage <= s.n AS required_now,
       COUNT(c.doc_id) AS received, COUNT(x.doc_id) AS extracted, MIN(x.min_score) AS min_score
FROM stage_no s CROSS JOIN req r
LEFT JOIN (SELECT d.loan_id, p.doc_id, p.doc_type FROM DOCUMENTS d JOIN DOC_PARSED p ON p.doc_id = d.doc_id) c
  ON c.loan_id = s.loan_id AND c.doc_type = r.doc_type
LEFT JOIN DOC_FIELDS x ON x.doc_id = c.doc_id
GROUP BY s.loan_id, r.doc_type, r.needed, r.from_stage, s.n;

-- One readable fact sheet per loan, the input to the QC narrative.
CREATE OR REPLACE VIEW LOAN_FACT_SHEET AS
SELECT l.loan_id,
  'Loan ' || l.loan_id || ': ' || l.purpose || ', ' || l.program || ', $' || l.loan_amount || ' for ' || l.borrower_name ||
  ', stage ' || l.stage || ', target closing ' || l.target_close_date || '. Checks (application vs documents): ' ||
  LISTAGG(c.check_name || ' ' || UPPER(c.status) || ' (application ' || COALESCE(c.application_value, 'n/a') || ', documents ' ||
          COALESCE(c.document_value, 'n/a') || COALESCE('; ' || c.detail, '') || ')', '; ') WITHIN GROUP (ORDER BY c.check_id) ||
  '. Open conditions: ' || COALESCE(ANY_VALUE(k.open_list), 'none') || '.' AS facts
FROM LOANS l JOIN LOAN_CHECKS c ON c.loan_id = l.loan_id
LEFT JOIN (SELECT loan_id, LISTAGG(description, ' | ') AS open_list FROM CONDITIONS WHERE status = 'Open' GROUP BY loan_id) k
  ON k.loan_id = l.loan_id
GROUP BY l.loan_id, l.purpose, l.program, l.loan_amount, l.borrower_name, l.stage, l.target_close_date;

-- The pipeline step. Called by the task; setup also calls it once for the bundled files.
CREATE OR REPLACE PROCEDURE PROCESS_NEW_DOCUMENTS()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  n INTEGER;
  started TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP();
BEGIN
  -- 1. Consume the stream (new files only).
  INSERT INTO DOC_QUEUE SELECT relative_path, CURRENT_TIMESTAMP(), FALSE
    FROM LOAN_DOCS_STREAM WHERE METADATA$ACTION = 'INSERT';
  -- Retry documents whose parse or classification came back empty on an earlier run
  -- (AI functions can return NULL when a call fails, for example under heavy load).
  UPDATE DOC_QUEUE SET processed = FALSE WHERE relative_path IN (SELECT file_name FROM DOC_PARSED WHERE doc_type IS NULL);
  DELETE FROM DOC_PARSED WHERE doc_type IS NULL;
  -- Withdraw open rule conditions whose check no longer fails (LOAN_CHECKS is a view, so it is current).
  DELETE FROM CONDITIONS WHERE source = 'Rule' AND status = 'Open'
    AND condition_id NOT IN (SELECT 'R-' || loan_id || '-' || check_id FROM LOAN_CHECKS WHERE status = 'Fail');
  SELECT COUNT(*) INTO :n FROM DOC_QUEUE WHERE NOT processed;
  IF (n = 0) THEN RETURN 'No new documents'; END IF;

  -- 2. OCR + layout; AI_CLASSIFY the document type from the parsed text.
  INSERT INTO DOC_PARSED (doc_id, file_name, parsed_text, page_count, doc_type, processed_at)
  WITH q AS (
    SELECT d.doc_id, q.relative_path
    FROM DOC_QUEUE q JOIN DOCUMENTS d ON d.file_name = q.relative_path
    WHERE NOT q.processed AND d.doc_id NOT IN (SELECT doc_id FROM DOC_PARSED)
  ), p AS (
    SELECT doc_id, relative_path, AI_PARSE_DOCUMENT(TO_FILE('@LOAN_DOCS', relative_path), {'mode': 'LAYOUT'}) AS parsed FROM q
  )
  SELECT doc_id, relative_path, parsed:content::STRING, parsed:metadata:pageCount::NUMBER,
         AI_CLASSIFY(parsed:content::STRING,
           [{'label': 'loan_application', 'description': 'a mortgage loan application summary with borrower-stated income and property'},
            {'label': 'pay_stub', 'description': 'an employee earnings statement or pay stub'},
            {'label': 'w2', 'description': 'an annual Form W-2 wage and tax statement'},
            {'label': 'bank_statement', 'description': 'a monthly bank or credit union account statement'},
            {'label': 'appraisal', 'description': 'a residential property appraisal report or summary of value'},
            {'label': 'title_commitment', 'description': 'a commitment for title insurance'},
            {'label': 'closing_disclosure', 'description': 'a mortgage closing disclosure with final loan terms'}],
           {'task_description': 'Classify the type of mortgage loan file document'}):labels[0]::STRING,
         CURRENT_TIMESTAMP()
  FROM p;

  -- 3. AI_EXTRACT the fields for each document type, with confidence scores.
  INSERT INTO DOC_FIELDS (doc_id, doc_type, fields, scores, min_score, line_items, extracted_at)
  WITH x AS (
    SELECT p.doc_id, p.doc_type,
           IFF(s.with_scores,
               AI_EXTRACT(file => TO_FILE('@LOAN_DOCS', p.file_name), responseFormat => s.response_format, scores => TRUE),
               AI_EXTRACT(file => TO_FILE('@LOAN_DOCS', p.file_name), responseFormat => s.response_format)) AS r
    FROM DOC_PARSED p JOIN EXTRACTION_SCHEMAS s ON s.doc_type = p.doc_type
    WHERE p.doc_id NOT IN (SELECT doc_id FROM DOC_FIELDS)
  )
  SELECT x.doc_id, ANY_VALUE(x.doc_type), OBJECT_DELETE(ANY_VALUE(x.r):response, 'deposits'),
         ANY_VALUE(x.r):scoring:scores, MIN(v.value:score::FLOAT), ANY_VALUE(x.r):response:deposits, CURRENT_TIMESTAMP()
  FROM x, LATERAL FLATTEN(input => x.r:scoring:scores, OUTER => TRUE) v
  GROUP BY x.doc_id;
  -- Retry extractions that came back empty.
  DELETE FROM DOC_FIELDS WHERE fields IS NULL OR fields = OBJECT_CONSTRUCT();

  UPDATE DOC_QUEUE SET processed = TRUE WHERE NOT processed;

  -- 4. Withdraw open rule conditions whose check no longer fails (for example, one opened while a
  --    document was still unextracted), then open a condition for every failing check without one.
  DELETE FROM CONDITIONS WHERE source = 'Rule' AND status = 'Open'
    AND condition_id NOT IN (SELECT 'R-' || loan_id || '-' || check_id FROM LOAN_CHECKS WHERE status = 'Fail');
  -- Open a condition for every failing tolerance check that doesn't have one yet.
  INSERT INTO CONDITIONS (condition_id, loan_id, category, description, status, source, opened_at)
  SELECT 'R-' || c.loan_id || '-' || c.check_id, c.loan_id, c.check_name,
         c.check_name || ' does not match the documents: application ' || c.application_value || ', documents ' || c.document_value ||
         COALESCE('. ' || c.detail, '') || '.', 'Open', 'Rule', (SELECT as_of_date FROM CONFIG)
  FROM LOAN_CHECKS c
  WHERE c.status = 'Fail' AND 'R-' || c.loan_id || '-' || c.check_id NOT IN (SELECT condition_id FROM CONDITIONS);

  -- 5. Refresh the AI QC narrative for loans that received documents.
  DELETE FROM QC_REVIEWS WHERE loan_id IN
    (SELECT d.loan_id FROM DOC_PARSED p JOIN DOCUMENTS d ON d.doc_id = p.doc_id WHERE p.processed_at >= :started);
  INSERT INTO QC_REVIEWS (loan_id, facts, narrative, model, generated_at)
  SELECT s.loan_id, s.facts,
         AI_COMPLETE('claude-sonnet-4-5',
           'You are a mortgage quality control reviewer. Using only these facts, write a QC narrative: first a 2-sentence '
           || 'overview of the file, then up to 3 short bullet points starting with "- " covering each failed or pending check '
           || '(name the document it came from) and the recommended next step. Thresholds come from the lender''s own credit policy table; do not attribute them to agencies or loan programs. If every check passes and no conditions are open, '
           || 'say the file appears ready to clear to close. Do not invent facts or amounts. Facts: ' || s.facts),
         'claude-sonnet-4-5', CURRENT_TIMESTAMP()
  FROM LOAN_FACT_SHEET s WHERE s.loan_id IN
    (SELECT d.loan_id FROM DOC_PARSED p JOIN DOCUMENTS d ON d.doc_id = p.doc_id WHERE p.processed_at >= :started);

  RETURN n || ' documents processed';
END;
$$;

-- First pass: copy the bundled synthetic files onto the stage and process them.
COPY FILES INTO @LOAN_DOCS FROM @LOAN_REPO/branches/main/data/documents/;
ALTER STAGE LOAN_DOCS REFRESH;
CALL PROCESS_NEW_DOCUMENTS();

CREATE OR REPLACE TASK PROCESS_DOCS_TASK
  WAREHOUSE = LOAN_REVIEW_WH
  SCHEDULE = '5 MINUTE'
  WHEN SYSTEM$STREAM_HAS_DATA('LOAN_DOCS_STREAM')
  AS CALL PROCESS_NEW_DOCUMENTS();
ALTER TASK PROCESS_DOCS_TASK RESUME;  -- the WHEN check costs no warehouse time while no files arrive

-- Re-extract one document on demand (the app's "Re-extract" button in the document drawer): drop its
-- parse and extraction results, put it back on the queue, and run the same pipeline the task runs,
-- so AI_PARSE_DOCUMENT, AI_CLASSIFY and AI_EXTRACT run again on that file, followed by the checks,
-- conditions and the QC narrative for its loan.
CREATE OR REPLACE PROCEDURE REEXTRACT_DOCUMENT(P_LOAN_ID STRING, P_DOC_ID STRING)
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  fname STRING;
  msg STRING;
  res VARIANT;
BEGIN
  SELECT MAX(file_name) INTO :fname FROM DOCUMENTS WHERE doc_id = :P_DOC_ID AND loan_id = :P_LOAN_ID;
  IF (fname IS NULL) THEN RETURN OBJECT_CONSTRUCT('error', 'Unknown document'); END IF;
  DELETE FROM DOC_FIELDS WHERE doc_id = :P_DOC_ID;
  DELETE FROM DOC_PARSED WHERE doc_id = :P_DOC_ID;
  DELETE FROM DOC_QUEUE WHERE relative_path = :fname;
  INSERT INTO DOC_QUEUE VALUES (:fname, CURRENT_TIMESTAMP(), FALSE);
  CALL PROCESS_NEW_DOCUMENTS() INTO :msg;
  SELECT OBJECT_CONSTRUCT('pipeline', :msg, 'doc_type', p.doc_type, 'page_count', p.page_count,
                          'fields', ARRAY_SIZE(OBJECT_KEYS(f.fields)), 'min_score', f.min_score)
    INTO :res
    FROM DOC_PARSED p LEFT JOIN DOC_FIELDS f ON f.doc_id = p.doc_id WHERE p.doc_id = :P_DOC_ID;
  RETURN res;
END;
$$;

-- 2c. Cortex Search over every loan's documents and conditions, for "Ask the file" ------
CREATE OR REPLACE VIEW LOAN_FILE_CHUNKS AS
SELECT d.loan_id, p.doc_id AS source_id, p.doc_type AS source_type,
       p.file_name AS source_name, d.received_at::STRING AS source_date, p.parsed_text AS chunk
FROM DOC_PARSED p JOIN DOCUMENTS d ON d.doc_id = p.doc_id WHERE p.parsed_text IS NOT NULL
UNION ALL
SELECT loan_id, condition_id, 'condition', 'Condition ' || condition_id || ' (' || status || ')', opened_at::STRING,
       category || ' condition: ' || description FROM CONDITIONS;

CREATE OR REPLACE CORTEX SEARCH SERVICE LOAN_FILE_SEARCH
  ON chunk
  ATTRIBUTES loan_id, source_type
  WAREHOUSE = LOAN_REVIEW_WH
  TARGET_LAG = '1 hour'
  AS SELECT loan_id, source_id, source_type, source_name, source_date, chunk FROM LOAN_FILE_CHUNKS;

-- 2d. Check the result -----------------------------------------------------------
SELECT COUNT(*) AS documents_parsed, COUNT_IF(p.doc_type = d.labeled_doc_type) AS doc_type_matches_label
FROM DOC_PARSED p JOIN DOCUMENTS d ON d.doc_id = p.doc_id;
SELECT check_name, status, COUNT(*) AS loans FROM LOAN_CHECKS GROUP BY 1, 2 ORDER BY 1, 2;
SELECT l.story, c.loan_id, c.check_name, c.application_value, c.document_value, c.detail
FROM LOANS l JOIN LOAN_CHECKS c USING (loan_id)
WHERE l.story IS NOT NULL AND (c.status = 'Fail' OR l.story = 'clean') ORDER BY c.loan_id, c.check_id;
