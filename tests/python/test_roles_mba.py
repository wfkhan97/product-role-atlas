"""pipeline/roles_mba.py: the title rules of the MBA role set. A handful of pointed cases; evals/titles_mba.json holds
the labelled set and evals/run_pipeline.py checks it."""
from pipeline import roles_mba as R


def read(title, category=None, company=None):
    fam = R.family(title, category, company)
    return fam, R.level(title, company, category, None, fam), R.ladder(title, company, category, None, fam)


# ---------- the two titles fixed in PR #49 ----------
def test_hardware_development_manager_is_not_real_estate_development():
    assert R.family("Hardware Development Manager, Amazon Industrial Robotics", None, "Amazon") is None, "Industrial names a product line, not a property type"
    assert R.family("Development Manager", "Real estate", "Hines") == "re_development", "at a real-estate firm a bare Development Manager still is"


def test_sales_manager_brand_partnerships_is_a_sales_manager():
    assert R.family("Sales Manager, Brand Partnerships", None, "Substack") == "sales_manager", "the team name after the comma is not the role"
    assert R.family("Brand Manager", None, "Kraft") == "brand_manager"


# ---------- campus and programme titles ----------
def test_summer_analyst_at_a_bank_is_the_entry_grade_of_banking():
    fam, level, ladder = read("Summer Analyst", "Investment banking", "Evercore")
    assert (fam, level, ladder) == ("ib_associate", "associate", "bank")
    assert R.entry("Summer Analyst", "Evercore", "Investment banking", None, fam, level) == ("pre_mba", True, "title")


def test_analyst_program_at_a_fund_is_the_entry_grade_of_private_equity():
    fam, level, ladder = read("2028 US Analyst Program (Full-Time)", "Private equity", "Warburg Pincus")
    assert (fam, level, ladder) == ("pe_associate", "associate", "bank")
    assert R.entry("2028 US Analyst Program (Full-Time)", "Warburg Pincus", "Private equity", None, fam, level) == ("pre_mba", False, "title")


def test_mba_summer_associate_with_no_function_is_a_programme_associate_for_mbas():
    fam, level, _ = read("MBA Summer Associate", None, "Acme")
    assert (fam, level) == ("ldp", "associate")
    assert R.entry("MBA Summer Associate", "Acme", None, None, fam, level) == ("mba", True, "title")


# ---------- the roles with no entry level ----------
def test_three_roles_have_no_entry_grade_and_their_junior_titles_are_other_jobs():
    assert R.NO_ENTRY_LEVEL == {"sales_manager", "general_manager", "chief_of_staff"}
    assert R.family("Sales Associate", None, "Gap") is None, "a sales associate is not a junior sales manager"
    assert R.family("Assistant General Manager", None, "Acme") is None
    assert R.family("Store General Manager", None, "Acme") is None, "a store or restaurant GM is not the general manager role"
    assert R.family("General Manager", None, "Acme") == "general_manager"
    assert R.family("Chief of Staff", None, "Acme") == "chief_of_staff"


# ---------- one grade word, two ladders ----------
def test_vice_president_is_a_leader_in_a_company_and_a_senior_rung_at_a_bank():
    assert read("Vice President, Strategy", None, "Acme") == ("strategy_manager", "vp", "corporate")
    assert read("Vice President, M&A", "Investment banking", "Evercore") == ("ib_associate", "senior", "bank")


def test_associate_is_the_mba_grade_at_a_bank_and_an_analyst_grade_in_a_company():
    assert read("Associate, Investment Banking", None, "Goldman Sachs Group") == ("ib_associate", "mid", "bank"), "a Fortune bank is on the bank ladder by name"
    assert read("Associate", "Private equity", "Warburg Pincus") == ("pe_associate", "mid", "bank")
    assert read("Senior Financial Analyst", None, "Acme") == ("financial_manager", "mid", "corporate")


def test_consulting_grades_sit_on_the_consulting_ladder_only_for_consultants():
    assert read("Senior Consultant", "Consulting and advisory", "Deloitte") == ("management_consultant", "senior", "consulting")
    assert read("Associate", "Strategy consulting", "McKinsey & Company") == ("management_consultant", "mid", "consulting")
    assert R.entry("Associate", "McKinsey & Company", "Strategy consulting", None, "management_consultant", "mid") == ("mba", False, "firm")


def test_a_bank_analyst_covering_the_technology_sector_is_a_banker():
    assert R.family("Analyst, Technology M&A", None, "Goldman Sachs Group") == "ib_associate"


# ---------- what the MBA scrape fetches ----------
def test_title_ok_leaves_the_product_families_to_the_product_scrape_and_knows_its_batches():
    assert R.title_ok("Product Manager") is False, "pm postings are already in data/raw/jobs"
    assert R.title_ok("Strategy Manager") is True
    assert R.title_ok("Brand Manager", batch=1) is False and R.title_ok("Brand Manager", batch=2) is True
    assert R.title_ok("Do not apply - test req") is False


# ---------- the AI transformation role (2026-10-30) ----------
def test_ai_transformation_is_its_own_role_and_transformation_covers_it():
    assert read("AI Transformation Lead", None, "Pfizer") == ("ai_transformation", "staff", "corporate")
    assert read("Head of AI Transformation & Enablement", None, "LifeStance Health") == ("ai_transformation", "vp", "corporate")
    assert R.family("AI Enablement Lead", None, "Siemens Energy") == "ai_transformation"
    assert R.family("Digital & AI Transformation Director", None, "Acme") == "ai_transformation", "AI named in a digital title is the AI role"
    assert R.family("Digital Transformation Lead", None, "Thermo Fisher Scientific") == "digital_transformation", "a digital title without AI does not move"
    assert R.family("Business Transformation Director", None, "Kraft Heinz") == "transformation"
    assert "ai_transformation" in R.COVERS["transformation"] and R.GROUP_OF["ai_transformation"] == "consulting_strategy"


def test_ai_engineers_strategists_and_consultants_are_not_the_ai_transformation_role():
    assert R.family("AI Transformation Engineer", None, "Acme") is None, "an engineer builds"
    assert R.family("Head of AI Research", None, "Acme") is None, "a lab, not a programme"
    assert R.family("AI Strategy Lead", "Consulting and advisory", "IBM") == "tech_strategy", "the labelled set keeps AI strategy with technology strategy"
    assert R.family("AI Transformation & Strategy Consultant", "Consulting and advisory", "Accenture") == "management_consultant", "at a consulting firm a consultant is the consultant role"
    assert R.title_ok("AI Transformation Lead", None, batch=2) and not R.title_ok("AI Transformation Lead", None, batch=1), "outside the first 25 roles: batch 2"


# ---------- the 13 business roles of the role-coverage audit (2026-11-05) ----------
def test_sales_titles_read_as_the_seller_whatever_market_follows():
    assert read("Account Executive, Financial Services -  Investment Banking", None, "AlphaSense") == ("account_executive", "mid", "corporate")
    assert read("Sales Development Representative", None, "Talkdesk") == ("account_executive", "associate", "corporate"), "an SDR is the entry grade"
    assert R.family("Mid Market Account Manager - Supply Chain and Logistics", None, "Kpler") == "account_executive"
    assert R.family("Technical Account Manager", None, "Acme") == "solutions_engineer", "the post-sales engineer"
    assert R.family("Customer Success Account Manager", None, "Acme") == "customer_success"
    assert R.family("Business Development Associate", None, "Thermo Fisher Scientific") == "bizdev"
    assert R.family("Manager, Sales Development Enterprise UK", None, "Airwallex") == "sales_manager"
    assert R.family("Solutions Architect, Enterprise", None, "Nebius") is None, "architects are not the role"


def test_data_and_project_titles_and_the_functions_that_win_over_them():
    assert R.family("Data Scientist, Cloud Distribution & Growth", None, "OpenAI") == "data_scientist"
    assert R.family("Applied Scientist", None, "Acme") is None
    assert R.family("Business Analyst", None, "PayJoy") == "data_analyst"
    assert R.family("Business Analyst", "Strategy consulting", "McKinsey & Company") == "management_consultant", "a strategy house's grade"
    assert R.family("Business Operations & Data Analyst", None, "Digital Asset") == "bizops"
    assert R.family("Project Manager", None, "Alpaca") == "project_manager"
    assert R.family("Supply Chain Project Manager", None, "Anduril Industries") == "supply_chain", "the function named wins"
    assert R.family("Construction Project Manager", None, "Acme") is None


def test_people_marketing_and_policy_roles():
    assert R.family("Investment Banking Recruiter", "Investment banking", "Lazard") == "recruiter"
    assert R.family("Participant Recruitment Partner/Sourcer", None, "Prolific") is None
    assert R.family("Digital Marketing Manager", None, "Pattern") == "demand_gen"
    assert R.family("Lifecycle Marketing Manager", None, "ClassPass") == "marketing_manager"
    assert R.family("Content Marketing Manager", None, "Range") == "marketing_manager"
    assert R.family("Marketing Communications Manager", None, "Acme") == "communications"
    assert R.family("Senior Communications Manager, Policy, Safety & Reputation", None, "Zoox") == "communications"
    assert R.family("Analyst, Investor Communications", "Private equity", "Golub Capital") is None
    assert R.family("Director of Government Affairs", None, "Applied Intuition") == "public_policy"
    assert R.family("Climate Program Manager", None, "Stripe") == "sustainability"
    assert R.family("Senior Manager, Marketing Research & Intelligence", None, "Coreweave") == "market_research"
    assert R.GROUP_OF["sustainability"] == R.GROUP_OF["public_policy"] == "impact"


def test_fraud_and_credit_risk_and_what_stays_compliance():
    assert R.family("Fraud Manager III- Business Operations", "Investment banking", "JPMorgan Chase") == "fraud_risk"
    assert R.family("Credit Risk Analyst", None, "Capital One Financial") == "fraud_risk"
    assert R.family("Fraud Strategy Analyst", None, "Acme") == "fraud_risk"
    assert R.family("AML/CTF Compliance Officer", None, "Satispay") == "compliance"
    assert R.family("Data Scientist - Fraud", None, "Plaid") == "data_scientist"
    assert R.title_ok("Fraud Strategist", None, batch=2) and not R.title_ok("Fraud Strategist", None, batch=1)


def test_implementation_and_customer_experience_and_their_edges():
    assert R.family("Implementation Consultant", None, "Black Duck") == "implementation"
    assert R.family("Manager, Client Onboarding and Implementation", None, "Vetcove") == "implementation"
    assert R.family("Customer Experience Representative, Trump Accounts", None, "Robinhood") is None, "a support desk"
    assert R.family("Employee Onboarding Specialist", None, "Acme") is None, "HR onboarding"
    assert R.family("Assistant Vice President, Statutory Implementation & Reporting", None, "Acme") is None
