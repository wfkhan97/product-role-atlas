"""The two country readers: extract.geo (the product map's, frozen) and geo.country (the strict one of the MBA set)."""
import pytest

from pipeline import extract as E, geo

US, OTHER = geo.US, geo.OTHER


# ---------- extract.geo: the product reader ----------
@pytest.mark.parametrize("location, country", [
    ("New York, NY", US), ("Austin, Texas", US), ("Seattle, WA", US), ("Austin", US), ("Remote - US", US),
    ("London, United Kingdom", "United Kingdom"), ("Bengaluru, India", "India"), ("Dublin, OH", US), ("Dublin, Ireland", "Ireland"),
])
def test_product_reader_places_us_forms_and_named_countries(location, country):
    assert E.geo(location)[0] == country


def test_product_reader_gives_no_country_for_an_empty_location_and_other_for_a_bare_remote():
    assert E.geo("") == (None, False)
    assert E.geo("Remote") == ("Other / unspecified", True)


def test_product_reader_takes_remote_from_the_title_too():
    assert E.geo("Seattle, WA", "Senior Analyst (Remote)") == (US, True)


# ---------- geo.country: the strict reader ----------
@pytest.mark.parametrize("location, country", [
    ("New York, NY", US), ("Austin, Texas", US), ("Remote - US", US), ("US - Remote", US), ("Dublin, OH", US),
    ("London, United Kingdom", "United Kingdom"), ("Bristol, gb", "United Kingdom"), ("Bengaluru, India", "India"), ("Bangalore, IN", "India"),
    ("DE - Munich, Germany", "Germany"), ("Dublin, Ireland", "Ireland"),
])
def test_strict_reader_places_one_site(location, country):
    assert geo.country(location)[0] == country


def test_strict_reader_fixes_what_the_product_reader_misread():
    """The cases geo.py's docstring names: a state abbreviation anywhere made a posting American."""
    assert E.geo("DE - Munich, Germany")[0] == US and geo.country("DE - Munich, Germany")[0] == "Germany"
    assert E.geo("Bangalore, IN")[0] == US and geo.country("Bangalore, IN")[0] == "India"


def test_strict_reader_returns_none_for_no_location_rather_than_guess():
    assert geo.country("") == (None, False, "")
    assert geo.country(None) == (None, False, "")
    assert geo._site("Remote") is None, "a bare Remote places nothing"
    assert geo._site("Building 4") is None, "a building name places nothing"
    assert geo.country("Remote") == (OTHER, True, "Remote"), "a location that places nothing is Other, flagged remote"
    assert geo.country("Unavailable")[0] == OTHER


def test_strict_reader_reads_a_list_of_sites():
    assert geo.country("Tokyo, Japan; New York, NY")[0] == US, "open at any US site: a US posting"
    assert geo.country("Paris, France | Berlin, Germany")[0] == OTHER, "sites in two countries agree on none"
    assert geo.country("Lyon, France / Paris, France")[0] == "France", "sites that agree give their country"


def test_strict_reader_takes_remote_from_the_title_but_never_the_country():
    assert geo.country("Remote", "Analyst (US)") == (OTHER, True, "Remote")
    assert geo.country("New York, NY", "Analyst - Remote")[1] is True


def test_location_from_a_successfactors_url():
    assert geo.from_url("https://x/job/Dallas%2C-TX-Senior-Consultant-TX-75201/123/") == "Dallas, TX"
    assert geo.from_url("https://careers.ey.com/ey/job/Gurugram-Associate-Consultant-HR-122003/1433611033/") == "Gurugram, India"
    assert geo.from_url("https://x/job/Springfield-Analyst/1/") == "Springfield", "a bare first word: left for the country reader, which places no bare US city"
    assert geo.from_url("https://x/job/London-Analyst/1/") == "London, United Kingdom"
    assert geo.from_url("https://x/careers/123") == ""
    assert geo.from_url(None) == ""


def test_strict_reader_reads_the_url_only_for_successfactors_boards():
    url = "https://x/job/London-Analyst/1/"
    assert geo.country("", url=url, ats="successfactors") == ("United Kingdom", False, "London, United Kingdom")
    assert geo.country("", url=url, ats="greenhouse") == (None, False, "")
