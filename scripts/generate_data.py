"""Seeded, deterministic generator for the Mortgage Loan File Review example.

Writes synthetic tables to data/csv/ and one PDF per borrower document to data/documents/
(loan application summaries, pay stubs, W-2s, bank statements, appraisal summaries, title
commitments and closing disclosures). sql/setup.sql loads both; the app's no-account mode
uses responses captured from the live app (scripts/capture-sample.mjs).
Every name, number, employer, bank and document is invented. Run: python3 scripts/generate_data.py
Requires: reportlab.
"""
import csv
import random
from datetime import date, datetime, timedelta
from pathlib import Path

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
CSV_DIR, DOC_DIR = ROOT / "data/csv", ROOT / "data/documents"
for d_ in (CSV_DIR, DOC_DIR):
    d_.mkdir(parents=True, exist_ok=True)

rng = random.Random(20261119)
AS_OF = date(2026, 11, 19)
LENDER = "Halvaren Home Lending"

FIRST = ["Avery", "Jordan", "Priya", "Mateo", "Elena", "Marcus", "Hana", "Diego", "Grace", "Omar", "Lena", "Caleb",
         "Sofia", "Andre", "Maya", "Felix", "Nadia", "Theo", "Rosa", "Isaac", "Leah", "Victor", "Imani", "Owen",
         "Clara", "Rahul", "Tessa", "Julian", "Amara", "Wes", "Nora", "Kofi", "Ines", "Ruben", "Mira", "Simon"]
LAST = ["Halvorsen", "Okafor", "Brennan", "Castillo", "Nakamura", "Whitcomb", "Delacroix", "Petrov", "Sandoval",
        "Ashworth", "Kowalczyk", "Moreau", "Lindqvist", "Abernathy", "Quintero", "Vasquez", "Thorne", "Iyer",
        "Galloway", "Fairbanks", "Mbeki", "Rasmussen", "Calloway", "Ortega", "Haverford", "Sato", "Marchetti"]
CITIES = [("Brookhaven", "OH", "43017"), ("Millbrook", "OH", "43065"), ("Cedar Falls", "OH", "43123"),
          ("Ashford", "OH", "43201"), ("Lakemont", "OH", "43082"), ("Riverton", "OH", "43230")]
STREETS = ["Maple Ave", "Oak St", "Elm Dr", "Harbor Rd", "Lincoln Blvd", "Pine Ridge Rd", "Willow Ln",
           "Kingsley Pkwy", "Station St", "Birchwood Ct", "Larkspur Way", "Fenwick Dr"]
EMPLOYERS = ["Kestavin Logistics LLC", "Norvale Health Partners", "Pellacor Systems Inc", "Ardentide Foods Co",
             "Silvanne Engineering Group", "Quorrin Analytics LLC", "Brisvale School District", "Talmont Freight Inc",
             "Oravine Dental Group", "Crestmarin Insurance Services"]
BANKS = ["Tessaly Federal Credit Union", "Orrin Savings Bank", "Calvenna National Bank"]
APPRAISERS = [("Halcrest Valuation Group", "Dana Whitlow, Certified Residential Appraiser"),
              ("Morrowfield Appraisal Services", "Victor Lanning, Certified Residential Appraiser")]
TITLE_CO = ["Brindlecove Title Agency", "Sorrelton Land Title Co"]
PROGRAMS = [("Conventional 30-year fixed", 55), ("FHA 30-year fixed", 20), ("VA 30-year fixed", 10),
            ("Conventional 15-year fixed", 15)]
PROCESSORS = ["Renata Okonkwo", "Dylan Achterberg", "Mei-Lin Carver", "Thomas Quill"]
STAGES = [("Application", 8), ("Processing", 13), ("Underwriting", 14), ("Conditional approval", 13),
          ("Clear to close", 6), ("Closed", 6)]


def name():
    return f"{rng.choice(FIRST)} {rng.choice(LAST)}"


def d(x):
    return x.isoformat()


def usd(x):
    return f"-${-x:,.2f}" if x < 0 else f"${x:,.2f}"


def weighted(items):
    t = rng.uniform(0, sum(w for _, w in items))
    for k, w in items:
        t -= w
        if t <= 0:
            return k
    return items[0][0]


loans, documents, conditions, qc_findings = [], [], [], []
doc_seq, cond_seq = [0], [0]
STORY = {}


def add_doc(loan, dtype, received, source, **content):
    doc_seq[0] += 1
    doc_id = f"DOC-{doc_seq[0]:04d}"
    rec = dict(doc_id=doc_id, loan_id=loan["loan_id"], labeled_doc_type=dtype,
               file_name=f"{doc_id}-{dtype.replace('_', '-')}.pdf",
               received_at=received.isoformat(timespec="minutes"), source=source)
    rec["_content"] = content
    documents.append(rec)
    return rec


def ts(day):
    return datetime(day.year, day.month, day.day, rng.randint(8, 17), rng.choice([4, 16, 28, 39, 51]))


def add_condition(loan, category, text, status, opened, cleared=None, source="Underwriting"):
    cond_seq[0] += 1
    conditions.append(dict(condition_id=f"C-{cond_seq[0]:04d}", loan_id=loan["loan_id"], category=category,
                           description=text, status=status, source=source, opened_at=d(opened),
                           cleared_at=d(cleared) if cleared else ""))


STD_CONDITIONS = [
    ("Insurance", "Provide homeowner's insurance declarations page showing the lender as mortgagee."),
    ("Employment", "Verbal verification of employment within 10 business days of closing."),
    ("Credit", "Letter of explanation for recent credit inquiries."),
    ("Property", "Provide HOA dues statement or confirm the property is not in an HOA."),
    ("Assets", "Provide the most recent two months of statements for all asset accounts."),
]


def make_loan(stage, story=None, **over):
    lid = f"LN-{260100 + len(loans) + 1}"
    borrower = over.get("borrower") or name()
    city, st, zipc = rng.choice(CITIES)
    salary = over.get("salary") or rng.choice(range(64000, 186000, 2600))
    purpose = over.get("purpose") or weighted([("Purchase", 70), ("Rate/term refinance", 20), ("Cash-out refinance", 10)])
    value = over.get("value") or rng.choice(range(240000, 690000, 5000))
    ltv = rng.choice([0.80, 0.80, 0.90, 0.95, 0.75, 0.70]) if purpose == "Purchase" else rng.choice([0.60, 0.70, 0.75])
    amount = int(round(value * ltv / 1000) * 1000)
    app_date = over.get("app_date") or {
        "Application": AS_OF - timedelta(days=rng.randint(1, 6)), "Processing": AS_OF - timedelta(days=rng.randint(7, 16)),
        "Underwriting": AS_OF - timedelta(days=rng.randint(15, 26)),
        "Conditional approval": AS_OF - timedelta(days=rng.randint(24, 34)),
        "Clear to close": AS_OF - timedelta(days=rng.randint(32, 40)), "Closed": AS_OF - timedelta(days=rng.randint(44, 70))}[stage]
    target = over.get("target") or app_date + timedelta(days=rng.choice([40, 42, 45, 45, 50]))
    employer = over.get("employer") or rng.choice(EMPLOYERS)
    monthly = round(salary / 12, 2)
    stated = over.get("stated_income") or round(monthly * rng.choice([1.0, 1.0, 1.0, 1.01, 0.99, 1.02]), 2)
    program = weighted(PROGRAMS)
    rate = {"Conventional 30-year fixed": 6.375, "FHA 30-year fixed": 6.125, "VA 30-year fixed": 5.99,
            "Conventional 15-year fixed": 5.625}[program] + rng.choice([0, 0.125, 0.25, -0.125])
    loan = dict(loan_id=lid, borrower_name=borrower, property_address=f"{rng.randint(14, 9800)} {rng.choice(STREETS)}, {city}, {st} {zipc}",
                loan_amount=amount, estimated_value=value, purpose=purpose, program=program, interest_rate=round(rate, 3),
                stage=stage, application_date=d(app_date), target_close_date=d(target),
                closed_date=d(target - timedelta(days=rng.randint(0, 3))) if stage == "Closed" else "",
                processor=rng.choice(PROCESSORS), stated_employer=employer, stated_monthly_income=stated, story=story or "")
    loan["_salary"], loan["_seller"] = salary, name()
    loans.append(loan)
    if story:
        STORY[story] = lid
    return loan


def docs_for(loan, deposit=None, appraisal_date=None):
    app = date.fromisoformat(loan["application_date"])
    stage = loan["stage"]
    salary, employer, borrower = loan["_salary"], loan["stated_employer"], loan["borrower_name"]
    freq = rng.choice(["Biweekly", "Biweekly", "Semimonthly"])
    periods = 26 if freq == "Biweekly" else 24
    gross = round(salary / periods, 2)
    # 1. Application summary (the borrower's stated facts).
    add_doc(loan, "loan_application", ts(app), "Online application",
            fields=[("Loan number", loan["loan_id"]), ("Borrower", borrower), ("Application date", loan["application_date"]),
                    ("Subject property", loan["property_address"]), ("Loan purpose", loan["purpose"]),
                    ("Loan program", loan["program"]), ("Loan amount", usd(loan["loan_amount"])),
                    ("Estimated property value", usd(loan["estimated_value"])), ("Current employer", employer),
                    ("Position", rng.choice(["Operations manager", "Senior analyst", "Registered nurse", "Software engineer",
                                             "Account executive", "Teacher", "Logistics coordinator", "Project engineer"])),
                    ("Years with employer", str(rng.randint(2, 14))),
                    ("Gross monthly base income", usd(loan["stated_monthly_income"])),
                    ("Other monthly income", "$0.00"), ("Declarations", "No bankruptcies, foreclosures or judgments declared.")])
    # 2. Two most recent pay stubs.
    last = AS_OF - timedelta(days=(AS_OF.weekday() - 4) % 7 + 7)  # a Friday at least a week back
    step = 14 if periods == 26 else 15
    for k in (1, 0):
        end = last - timedelta(days=step * k)
        n = (end - date(2026, 1, 1)).days // step + 1
        add_doc(loan, "pay_stub", ts(min(AS_OF, max(app, end + timedelta(days=3)))), "Borrower upload",
                employee=borrower, employer=employer, period_end=d(end), pay_date=d(end + timedelta(days=5)),
                freq=freq, gross=gross, ytd=round(gross * n, 2),
                lines=[("Regular salary", gross), ("Federal income tax", -round(gross * 0.12, 2)),
                       ("Social Security", -round(gross * 0.062, 2)), ("Medicare", -round(gross * 0.0145, 2)),
                       ("401(k) 5%", -round(gross * 0.05, 2)), ("Medical plan", -round(rng.choice([88.0, 112.5, 146.0]), 2))])
    # 3. W-2 for the prior year (two years for some borrowers).
    for yr in ([2025, 2024] if rng.random() < 0.45 else [2025]):
        wages = round(salary * (0.97 if yr == 2025 else 0.93), 2)
        add_doc(loan, "w2", ts(app + timedelta(days=rng.randint(0, 3))), "Borrower upload",
                employee=borrower, employer=employer, year=yr, wages=wages, fed=round(wages * 0.12, 2),
                ss=round(wages * 0.062, 2), med=round(wages * 0.0145, 2))
    # 4. Two monthly bank statements; payroll deposits plus small transfers.
    bank = rng.choice(BANKS)
    acct = f"****{rng.randint(1000, 9999)}"
    net = round(gross * 0.70, 2)
    bal = rng.choice(range(18000, 96000, 1300))
    for m, (start, end) in enumerate([(date(2026, 9, 1), date(2026, 9, 30)), (date(2026, 10, 1), date(2026, 10, 31))]):
        deps = []
        pay = start + timedelta(days=rng.randint(1, 8))
        while pay <= end:
            deps.append((d(pay), f"PAYROLL DIR DEP {employer.split()[0].upper()}", net))
            pay += timedelta(days=step)
        if rng.random() < 0.5:
            deps.append((d(start + timedelta(days=rng.randint(10, 25))), "TRANSFER FROM SAVINGS ****" + str(rng.randint(1000, 9999)),
                         float(rng.choice([150, 200, 250, 300]))))
        if deposit and m == deposit[0]:
            deps.append(deposit[1])
        deps.sort()
        total_in = sum(a for *_, a in deps)
        out = round(total_in * rng.uniform(0.82, 0.97), 2)
        opening = bal
        bal = round(bal + total_in - out, 2)
        add_doc(loan, "bank_statement", ts(max(app, end + timedelta(days=rng.randint(2, 6)))), "Borrower upload",
                bank=bank, holder=borrower, account=acct, start=d(start), end=d(end), opening=opening,
                closing=bal, deposits=deps, withdrawals=out)
    # 5. Appraisal summary, title commitment, closing disclosure as the file progresses.
    if stage != "Application":
        eff = appraisal_date or (app + timedelta(days=rng.randint(6, 12)))
        firm, appraiser = rng.choice(APPRAISERS)
        value = loan["estimated_value"] + rng.choice([0, 0, 5000, -5000, 10000])
        loan["_appraised"] = value
        add_doc(loan, "appraisal", ts(max(app, eff) + timedelta(days=3)), "Appraisal management company",
                firm=firm, appraiser=appraiser, address=loan["property_address"], eff=d(eff), value=value,
                ptype=rng.choice(["Single family detached", "Single family detached", "Townhouse", "Condominium"]),
                gla=rng.randint(1180, 3400), year=rng.randint(1962, 2021))
        tdate = app + timedelta(days=rng.randint(5, 11))
        add_doc(loan, "title_commitment", ts(tdate + timedelta(days=1)), "Title agent portal",
                company=rng.choice(TITLE_CO), number=f"TC-{rng.randint(260000, 269999)}", eff=d(tdate),
                address=loan["property_address"], owner=loan["_seller"] if loan["purpose"] == "Purchase" else borrower,
                insured=f"{LENDER}, its successors and/or assigns", amount=loan["loan_amount"])
    if stage in ("Conditional approval", "Clear to close", "Closed"):
        cd_day = date.fromisoformat(loan["target_close_date"]) - timedelta(days=rng.randint(4, 7))
        cd_day = min(cd_day, AS_OF)
        rate = loan["interest_rate"] / 100 / 12
        n = 180 if "15-year" in loan["program"] else 360
        pi = loan["loan_amount"] * rate / (1 - (1 + rate) ** -n)
        down = max(0, loan["estimated_value"] - loan["loan_amount"]) if loan["purpose"] == "Purchase" else 0
        add_doc(loan, "closing_disclosure", ts(cd_day), "Loan origination system",
                borrower=borrower, address=loan["property_address"], amount=loan["loan_amount"], rate=loan["interest_rate"],
                program=loan["program"], pi=round(pi, 2), close=loan["target_close_date"],
                cash=round(down + loan["loan_amount"] * 0.028, 2) if down else round(loan["loan_amount"] * 0.006, 2))


def seed_conditions(loan, all_cleared=False):
    app = date.fromisoformat(loan["application_date"])
    for cat, text in rng.sample(STD_CONDITIONS, rng.randint(2, 4)):
        opened = app + timedelta(days=rng.randint(8, 16))
        if opened > AS_OF or loan["stage"] in ("Application", "Processing"):
            continue
        done = all_cleared or loan["stage"] in ("Clear to close", "Closed") or \
            (loan["stage"] == "Conditional approval" and rng.random() < 0.55) or rng.random() < 0.2
        cleared = min(AS_OF, opened + timedelta(days=rng.randint(2, 9))) if done else None
        add_condition(loan, cat, text, "Cleared" if done else "Open", opened, cleared)


# ---- Story 1: application income 18% higher than the pay stubs support.
s1 = make_loan("Underwriting", story="income", borrower="Desmond Varga", salary=96000, employer="Talmont Freight Inc",
               stated_income=9440.00, purpose="Purchase", value=415000)
docs_for(s1)
seed_conditions(s1)
# ---- Story 2: a large, unexplained deposit on the October bank statement.
s2 = make_loan("Conditional approval", story="deposit", borrower="Hana Lindqvist", salary=88400,
               employer="Norvale Health Partners", purpose="Purchase", value=372000)
docs_for(s2, deposit=(1, ("2026-10-17", "MOBILE DEPOSIT CHECK 4471", 18500.0)))
seed_conditions(s2)
# ---- Story 3: the appraisal is older than the 120-day policy by the target closing date.
s3 = make_loan("Conditional approval", story="appraisal", borrower="Marisol Quintero", salary=121000,
               employer="Silvanne Engineering Group", purpose="Rate/term refinance", value=505000,
               app_date=date(2026, 6, 2), target=date(2026, 11, 25))
docs_for(s3, appraisal_date=date(2026, 6, 10))
seed_conditions(s3)
add_condition(s3, "Closing", "Rate lock extended to 2026-11-25 after a closing delay.", "Cleared",
              date(2026, 9, 14), date(2026, 9, 15))
# ---- Story 4: a clean file; every check passes and every condition is cleared.
s4 = make_loan("Conditional approval", story="clean", borrower="Bram Kowalczyk", salary=104000,
               employer="Pellacor Systems Inc", purpose="Purchase", value=438000, stated_income=8666.67)
docs_for(s4)
seed_conditions(s4, all_cleared=True)

# ---- Everyone else
plan = [s for s, n in STAGES for _ in range(n)]
for st in ("Underwriting", "Conditional approval", "Conditional approval", "Conditional approval"):
    plan.remove(st)
for st in plan:
    ln = make_loan(st)
    docs_for(ln)
    seed_conditions(ln)

# Keep only documents received by the as-of date.
cutoff = datetime(AS_OF.year, AS_OF.month, AS_OF.day, 23, 59)
documents = [x for x in documents if datetime.fromisoformat(x["received_at"]) <= cutoff]

# Historical post-closing QC findings (12 months of sampled closed loans, not in the active pipeline).
FTYPES = [("Income calculation", 26), ("Asset documentation", 18), ("Appraisal", 11), ("Disclosure timing", 14),
          ("Credit documentation", 12), ("Title and closing", 9), ("No finding", 70)]
for m in range(12):
    month = date(2025, 11, 1)
    month = date(month.year + (month.month - 1 + m) // 12, (month.month - 1 + m) % 12 + 1, 1)
    for i in range(rng.randint(10, 16)):
        ft = weighted(FTYPES)
        sev = "None" if ft == "No finding" else weighted([("Low", 50), ("Moderate", 35), ("Significant", 15)])
        qc_findings.append(dict(finding_id=f"QC-{len(qc_findings) + 1:04d}", loan_id=f"H-{25000 + len(qc_findings)}",
                                review_month=d(month), finding_type=ft, severity=sev,
                                description={"Income calculation": "Qualifying income not supported by the most recent pay stubs.",
                                             "Asset documentation": "Large deposit not sourced before closing.",
                                             "Appraisal": "Appraisal older than policy allowed at closing.",
                                             "Disclosure timing": "Closing disclosure delivered less than three business days before closing.",
                                             "Credit documentation": "Missing letter of explanation for a recent inquiry.",
                                             "Title and closing": "Title commitment requirement not cleared in file.",
                                             "No finding": "File meets policy."}[ft]))

# --------------------------------------------------------------------------- render documents
W, H = LETTER


def header(cv, title, org, sub=""):
    cv.setFillColorRGB(0.10, 0.20, 0.34)
    cv.rect(0, H - 74, W, 74, fill=1, stroke=0)
    cv.setFillColorRGB(1, 1, 1)
    cv.setFont("Helvetica-Bold", 15)
    cv.drawString(48, H - 40, org)
    cv.setFont("Helvetica", 10)
    cv.drawString(48, H - 58, sub)
    cv.setFillColorRGB(0, 0, 0)
    cv.setFont("Helvetica-Bold", 13)
    cv.drawString(48, H - 104, title)
    cv.setFont("Helvetica", 7)
    cv.setFillColorRGB(0.45, 0.45, 0.45)
    cv.drawString(48, 30, "SYNTHETIC DOCUMENT - generated for a Snowflake example. All names, numbers and organizations are fictional.")
    cv.setFillColorRGB(0, 0, 0)


def wrap(text, width=70):
    out, line = [], ""
    for w in str(text).split():
        if len(line) + len(w) + 1 > width:
            out.append(line)
            line = w
        else:
            line = f"{line} {w}".strip()
    return out + ([line] if line else [])


def kv(cv, y, label, value, wl=170):
    cv.setFont("Helvetica-Bold", 10)
    cv.drawString(48, y, f"{label}:")
    cv.setFont("Helvetica", 10)
    lines = wrap(value)
    for i, ln in enumerate(lines):
        cv.drawString(48 + wl, y - 14 * i, ln)
    return y - 14 * max(1, len(lines)) - 6


def table(cv, y, cols, rows):
    cv.setFont("Helvetica-Bold", 9.5)
    for x, h, right in cols:
        (cv.drawRightString if right else cv.drawString)(x, y, h)
    y -= 6
    cv.line(48, y, W - 48, y)
    y -= 14
    cv.setFont("Helvetica", 9.5)
    for r in rows:
        for (x, _, right), v in zip(cols, r):
            (cv.drawRightString if right else cv.drawString)(x, y, v)
        y -= 15
    cv.line(48, y + 6, W - 48, y + 6)
    return y - 8


def render(doc):
    k, t = doc["_content"], doc["labeled_doc_type"]
    cv = canvas.Canvas(str(DOC_DIR / doc["file_name"]), pagesize=LETTER, invariant=1)
    cv.setTitle(f"{doc['doc_id']} {t}")
    y = H - 132
    if t == "loan_application":
        header(cv, "Uniform Residential Loan Application - Summary", LENDER, "Borrower-stated information")
        for a, b in k["fields"]:
            y = kv(cv, y, a, b)
    elif t == "pay_stub":
        header(cv, "Earnings Statement", k["employer"], "Payroll department")
        for a, b in [("Employee", k["employee"]), ("Pay period ending", k["period_end"]), ("Pay date", k["pay_date"]),
                     ("Pay frequency", k["freq"])]:
            y = kv(cv, y, a, b)
        y = table(cv, y - 4, [(48, "Earnings and deductions", False), (W - 48, "This period", True)],
                  [(a, usd(b)) for a, b in k["lines"]])
        net = round(sum(b for _, b in k["lines"]), 2)
        cv.setFont("Helvetica-Bold", 10.5)
        for a, b in [("GROSS PAY THIS PERIOD", usd(k["gross"])), ("NET PAY THIS PERIOD", usd(net)),
                     ("YEAR-TO-DATE GROSS", usd(k["ytd"]))]:
            cv.drawString(48, y, a)
            cv.drawRightString(W - 48, y, b)
            y -= 16
    elif t == "w2":
        header(cv, f"Form W-2 Wage and Tax Statement - {k['year']}", k["employer"], "Copy C for employee's records")
        for a, b in [("Employee name", k["employee"]), ("Employer", k["employer"]), ("Tax year", str(k["year"])),
                     ("Box 1 Wages, tips, other compensation", usd(k["wages"])),
                     ("Box 2 Federal income tax withheld", usd(k["fed"])), ("Box 4 Social Security tax withheld", usd(k["ss"])),
                     ("Box 6 Medicare tax withheld", usd(k["med"]))]:
            y = kv(cv, y, a, b, 250)
    elif t == "bank_statement":
        header(cv, "Account Statement - Checking", k["bank"], "Member services")
        for a, b in [("Account holder", k["holder"]), ("Account number", k["account"]),
                     ("Statement period", f"{k['start']} to {k['end']}"), ("Opening balance", usd(k["opening"]))]:
            y = kv(cv, y, a, b)
        cv.setFont("Helvetica-Bold", 10.5)
        cv.drawString(48, y - 2, "Deposits and credits")
        y = table(cv, y - 20, [(48, "Date", False), (130, "Description", False), (W - 48, "Amount", True)],
                  [(a, b, usd(c)) for a, b, c in k["deposits"]])
        for a, b in [("Total deposits", usd(sum(c for *_, c in k["deposits"]))), ("Total withdrawals and debits", usd(k["withdrawals"])),
                     ("Closing balance", usd(k["closing"]))]:
            y = kv(cv, y, a, b)
    elif t == "appraisal":
        header(cv, "Appraisal Report - Summary of Value", k["firm"], "Uniform Residential Appraisal Report (excerpt)")
        for a, b in [("Subject property", k["address"]), ("Property type", k["ptype"]), ("Gross living area", f"{k['gla']:,} sq ft"),
                     ("Year built", str(k["year"])), ("Effective date of appraisal", k["eff"]),
                     ("Opinion of market value", usd(k["value"])), ("Appraiser", k["appraiser"]),
                     ("Intended user", LENDER)]:
            y = kv(cv, y, a, b)
    elif t == "title_commitment":
        header(cv, "Commitment for Title Insurance", k["company"], "Schedule A")
        for a, b in [("Commitment number", k["number"]), ("Commitment date", k["eff"]), ("Property", k["address"]),
                     ("Title vested in", k["owner"]), ("Proposed insured", k["insured"]),
                     ("Proposed amount of insurance", usd(k["amount"])),
                     ("Requirements", "Payoff of existing liens; recording of the insured mortgage; standard affidavits.")]:
            y = kv(cv, y, a, b)
    elif t == "closing_disclosure":
        header(cv, "Closing Disclosure", LENDER, "This form is a statement of final loan terms and closing costs")
        for a, b in [("Borrower", k["borrower"]), ("Property", k["address"]), ("Closing date", k["close"]),
                     ("Loan term and product", k["program"]), ("Loan amount", usd(k["amount"])),
                     ("Interest rate", f"{k['rate']:.3f}%"), ("Monthly principal and interest", usd(k["pi"])),
                     ("Cash to close", usd(k["cash"]))]:
            y = kv(cv, y, a, b)
    cv.save()


for f in DOC_DIR.glob("*"):
    f.unlink()
for doc in documents:
    render(doc)

# --------------------------------------------------------------------------- write tables
for ln in loans:
    for key in [k for k in ln if k.startswith("_")]:
        ln.pop(key)
pub_docs = [{k: v for k, v in x.items() if not k.startswith("_")} for x in documents]
for tname, rows in dict(loans=loans, documents=pub_docs, conditions=conditions, qc_findings=qc_findings).items():
    with open(CSV_DIR / f"{tname}.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

print(f"{len(loans)} loans, {len(documents)} documents, {len(conditions)} conditions, {len(qc_findings)} QC findings. "
      f"Stories: {STORY}")
