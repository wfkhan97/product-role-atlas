"""pipeline/sponsorship.py: visa sponsorship as a posting fact. A yes, a no, and the words that only look like one."""
from pipeline import sponsorship


def test_a_posting_that_says_it_sponsors_reads_yes():
    for t in ["Visa sponsorship is available for this position.", "We will sponsor H-1B visas for the right candidate.",
              "H-1B sponsorship available.", "Limited immigration sponsorship may be available.", "The company is able to sponsor work visas.",
              "Sponsorship for H-1B transfers is offered.", "We provide visa sponsorship to qualified applicants."]:
        assert sponsorship.read(t) == "yes", t


def test_a_posting_that_says_it_does_not_sponsor_reads_no():
    for t in ["This position is not eligible for visa sponsorship.", "We are unable to sponsor visas at this time.",
              "Capital One will not sponsor a new applicant for employment authorization for this position.",
              "Must be authorized to work in the United States without sponsorship.",
              "Applicants must not now, or in the future, require sponsorship for an employment visa.",
              "Visa sponsorship is not available for this role.", "No visa sponsorship.", "This is not a position for which sponsorship will be provided.",
              "Candidates must be legally authorized to work in the U.S. without the need for employment-based visa sponsorship now or in the future."]:
        assert sponsorship.read(t) == "no", t


def test_a_no_wins_over_a_yes_in_the_same_posting():
    assert sponsorship.read("We sponsor H-1B visas for most roles. This position is not eligible for visa sponsorship.") == "no"


def test_the_word_alone_is_not_the_fact():
    for t in ["Collaborate with project sponsors and stakeholders.", "Company-sponsored volunteer opportunities and events.",
              "A company-sponsored interim secret clearance is required to start.", "Coaching sponsors through improvement initiatives.",
              "Regular sponsored professional development opportunities.", "Corporate Sponsored Events & Community Outreach.",
              "", None, "Build the forecast and present it to the CFO."]:
        assert sponsorship.read(t) is None, t


def test_counts_treat_a_missing_field_as_silent():
    assert sponsorship.counts([{"sponsorship": "yes"}, {"sponsorship": "no"}, {}, {"sponsorship": None}]) == {"yes": 1, "no": 1, "silent": 2}
