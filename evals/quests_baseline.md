# The side-project eval baseline

Written by `node evals/quests.mjs --baseline` on 2026-11-27: 51 of 51 cases, model claude-opus-5-5, direct. The rules are web/quests.js validate.

## The cases
- course_list · business_analytics · own_tools: 3 asked, 3 kept; stop end_turn
- course_list · business_analytics · builder: 3 asked, 3 kept; stop end_turn
- course_list · business_analytics · rewrite: 3 asked, 3 kept; stop end_turn
- course_list · pmm · own_tools: 3 asked, 3 kept; stop end_turn
- course_list · pmm · builder: 3 asked, 3 kept; stop end_turn
- course_list · pmm · rewrite: 3 asked, 3 kept; stop end_turn
- experienced_pm · pmm · own_tools: 3 asked, 3 kept; stop end_turn
- experienced_pm · pmm · builder: 3 asked, 3 kept; stop end_turn
- experienced_pm · pmm · rewrite: 3 asked, 3 kept; stop end_turn
- experienced_pm · product.pm · own_tools: 3 asked, 3 kept; stop end_turn
- experienced_pm · product.pm · builder: 3 asked, 3 kept; stop end_turn
- experienced_pm · product.pm · rewrite: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · pmm · own_tools: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · pmm · builder: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · pmm · rewrite: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · bizops · own_tools: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · bizops · builder: 3 asked, 3 kept; stop end_turn
- experienced_with_coursework · bizops · rewrite: 3 asked, 3 kept; stop end_turn
- grad_student_new · pmm · own_tools: 3 asked, 3 kept; stop end_turn
- grad_student_new · pmm · builder: 3 asked, 3 kept; stop end_turn
- grad_student_new · pmm · rewrite: 3 asked, 3 kept; stop end_turn
- grad_student_new · data_analyst · own_tools: 3 asked, 3 kept; stop end_turn
- grad_student_new · data_analyst · builder: 3 asked, 3 kept; stop end_turn
- grad_student_new · data_analyst · rewrite: 3 asked, 3 kept; stop end_turn
- grad_student_new · tech.data_engineer · own_tools: 3 asked, 3 kept; stop end_turn
- grad_student_new · tech.data_engineer · builder: 3 asked, 3 kept; stop end_turn
- grad_student_new · tech.data_engineer · rewrite: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · market_research · own_tools: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · market_research · builder: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · market_research · rewrite: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · tech.ux_researcher · own_tools: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · tech.ux_researcher · builder: 3 asked, 3 kept; stop end_turn
- pivot_phd_hci · tech.ux_researcher · rewrite: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · general_manager · own_tools: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · general_manager · builder: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · general_manager · rewrite: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · strategy_manager · own_tools: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · strategy_manager · builder: 3 asked, 3 kept; stop end_turn
- senior_pm_pdf_layout · strategy_manager · rewrite: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · general_manager · own_tools: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · general_manager · builder: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · general_manager · rewrite: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · tech.software_engineer · own_tools: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · tech.software_engineer · builder: 3 asked, 3 kept; stop end_turn
- staff_pm_terse · tech.software_engineer · rewrite: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · marketing_manager · own_tools: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · marketing_manager · builder: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · marketing_manager · rewrite: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · business_analytics · own_tools: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · business_analytics · builder: 3 asked, 3 kept; stop end_turn
- template_placeholder_years · business_analytics · rewrite: 3 asked, 3 kept; stop end_turn

## Validity per rule (153 projects asked, 153 kept)
| rule | projects failing | share of projects |
|---|---|---|
| schema | 0 | 0% |
| level | 0 | 0% |
| artifact_only | 0 | 0% |
| skills_on_tree | 0 | 0% |
| kind_in_kit | 0 | 0% |
| kind_allowed | 0 | 0% |
| tools_allowed | 0 | 0% |
| place_in_kit | 0 | 0% |
| place_allowed | 0 | 0% |
| title_words | 0 | 0% |
| ship_words | 0 | 0% |
| steps_count | 0 | 0% |
| step_words | 0 | 0% |
| prompt_words | 0 | 0% |
| no_duration | 0 | 0% |
| no_mission | 0 | 0% |
| why_voice | 0 | 0% |
| avoided | 0 | 0% |
| duplicate | 0 | 0% |
| quote_dropped | 0 | 0% |
| share_dropped | 1 | 1% |
| level_mix | 0 | 0% |

(level_mix counts answers whose levels were not two beginner and one intermediate; share_dropped and quote_dropped cut a part, never the project.)

## The kept projects
- levels: 102 beginner, 51 intermediate; with a share: 152 of 153

## Drops and cost
- cases read: 51 of 51; asked this run: 0
- projects dropped: 0 of 153 (0%); cases with no project kept after the retry: 0; retries: 0
- tokens: 99052 in, 165315 out, 191050 cache read, 3821 cache written
- cost at Opus 5.5 ($4 / $20 per million in / out): $3.76 in all, $0.074 per person (one write)
