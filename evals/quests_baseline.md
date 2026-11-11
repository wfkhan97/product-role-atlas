# The side-project eval baseline

Written by `node evals/quests.mjs --baseline` on 2026-11-11: 32 of 32 cases, model claude-opus-5-5, direct. The rules are web/quests.js validate.

## The cases
- course_list · business_analytics · no_code: 3 asked, 3 kept; stop end_turn
- course_list · business_analytics · builder: 3 asked, 3 kept; stop end_turn
- course_list · pmm · no_code: 3 asked, 3 kept; stop end_turn
- course_list · pmm · builder: 3 asked, 3 kept; stop end_turn
- experienced_pm · pmm · no_code: 3 asked, 3 kept; stop end_turn
- experienced_pm · pmm · builder: 3 asked, 3 kept; stop end_turn
- experienced_pm · general_manager · no_code: 3 asked, 3 kept; stop end_turn
- experienced_pm · general_manager · builder: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · pmm · no_code: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · pmm · builder: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · bizops · no_code: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · bizops · builder: 3 asked, 3 kept; stop end_turn
- grad_student_new · pmm · no_code: 3 asked, 3 kept; stop end_turn
- grad_student_new · pmm · builder: 3 asked, 3 kept; stop end_turn
- grad_student_new · data_analyst · no_code: 3 asked, 3 kept; stop end_turn
- grad_student_new · data_analyst · builder: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · market_research · no_code: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · market_research · builder: 3 asked, 2 kept; dropped: no_duration; stop end_turn
- pivot_phd_hci · pmm · no_code: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · pmm · builder: 3 asked, 2 kept; dropped: title_words; stop end_turn
- senior_pm_pdf_layout · general_manager · no_code: 3 asked, 2 kept; dropped: no_duration; stop end_turn
- senior_pm_pdf_layout · general_manager · builder: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · strategy_manager · no_code: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · strategy_manager · builder: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · general_manager · no_code: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · general_manager · builder: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · bizops · no_code: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · bizops · builder: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · marketing_manager · no_code: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · marketing_manager · builder: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · business_analytics · no_code: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · business_analytics · builder: 3 asked, 3 kept; stop end_turn

## Validity per rule (96 projects asked, 93 kept)
| rule | projects failing | share of projects |
|---|---|---|
| schema | 0 | 0% |
| skills_on_tree | 0 | 0% |
| kind_in_kit | 0 | 0% |
| kind_allowed | 0 | 0% |
| host_in_kit | 0 | 0% |
| host_allowed | 0 | 0% |
| database_allowed | 0 | 0% |
| title_words | 1 | 1% |
| ship_words | 0 | 0% |
| steps_count | 0 | 0% |
| step_words | 0 | 0% |
| prompt_words | 0 | 0% |
| no_duration | 2 | 2% |
| no_mission | 0 | 0% |
| duplicate | 0 | 0% |
| quote_dropped | 0 | 0% |

## Drops and cost
- cases read: 32 of 32; asked this run: 10
- projects dropped: 3 of 96 (3%); cases with no project kept after the retry: 0; retries: 0
- tokens: 58350 in, 76034 out, 63030 cache read, 4202 cache written
- cost at Opus 5.5 ($4 / $20 per million in / out): $1.79 in all, $0.056 per person (one write)
