-- =============================================================================
-- Mortgage Loan File Review: cleanup
-- Drops everything sql/setup.sql created. The database drop removes its tables, views,
-- function, stages and files, stream, task, procedure, Cortex Search service, and Git repository clone.
-- =============================================================================
-- Objects are owned by the example role, so drop them as that role first.
USE ROLE LOAN_REVIEW_DEMO_ROLE;
ALTER TASK IF EXISTS LOAN_REVIEW_DEMO.LOANS.PROCESS_DOCS_TASK SUSPEND;
DROP DATABASE IF EXISTS LOAN_REVIEW_DEMO;
DROP WAREHOUSE IF EXISTS LOAN_REVIEW_WH;

USE ROLE ACCOUNTADMIN;
DROP INTEGRATION IF EXISTS LOAN_REVIEW_GIT_API;
DROP ROLE IF EXISTS LOAN_REVIEW_DEMO_ROLE;
