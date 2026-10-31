import sys

from . import greenhouse, lever, ashby, workday, eightfold, phenom, oracle_hcm, smartrecruiters, amazon, apple, google, gs_graphql, jibe, paradox, radancy, bofa_servlet, mcloud, successfactors, icims, meta, mckinsey, avature, kpmg, talnet, yello

ADAPTERS = {
    "greenhouse": greenhouse.fetch,
    "lever": lever.fetch,
    "ashby": ashby.fetch,
    "workday": workday.fetch,
    "eightfold": eightfold.fetch,
    "phenom": phenom.fetch,
    "oracle_hcm": oracle_hcm.fetch,
    "smartrecruiters": smartrecruiters.fetch,
    "amazon": amazon.fetch,
    "apple": apple.fetch,
    "google": google.fetch,
    "gs_graphql": gs_graphql.fetch,
    "jibe": jibe.fetch,
    "paradox": paradox.fetch,
    "radancy": radancy.fetch,
    "bofa_servlet": bofa_servlet.fetch,
    "mcloud": mcloud.fetch,
    "successfactors": successfactors.fetch,
    "icims": icims.fetch,
    "meta": meta.fetch,
    "mckinsey": mckinsey.fetch,
    "avature": avature.fetch,
    "kpmg": kpmg.fetch,
    "talnet": talnet.fetch,
    "yello": yello.fetch,
}

# ats -> still_open(company, cfg, posting): True on the board, False gone, None cannot tell. pipeline.scrape asks it
# about each open posting an incomplete fetch did not return; a family without one closes nothing on such a fetch.
_MODULES = {name: fn.__module__ for name, fn in ADAPTERS.items()}
CHECKS = {name: getattr(sys.modules[mod], "still_open") for name, mod in _MODULES.items()
          if hasattr(sys.modules[mod], "still_open")}
