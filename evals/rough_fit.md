# Rough fit vs the full matcher

Written by `node evals/rough_fit.mjs --baseline` on 2026-11-05. 59 resumes (45 published samples with a role in the file name), scored over the 51 MBA roles with postings (13 without postings yet are left out: account_executive, solutions_engineer, data_scientist, data_analyst, project_manager, recruiter, implementation, communications, demand_gen, market_research, sustainability, public_policy, fraud_risk).

| measure | value |
|---|---|
| median Spearman, rough vs full over the 51 roles | 0.79 |
| full matcher's top role in the rough top 5 | 78% |
| full matcher's top role's field in the rough top 3 fields | 83% |
| the sample's own role in the rough top 5 | 60% |
| the sample's own field in the rough top 3 fields | 82% |

| resume | own role | rho | full top role | in rough top 5 | field in top 3 | roles held |
|---|---|---|---|---|---|---|
| course_list.txt |  | 0.75 | product_strategy | no | no |  |
| experienced_pm.txt |  | 0.71 | product_strategy | no | no | product_manager data_analyst |
| experienced_with_coursework.txt |  | 0.83 | procurement | yes | yes | procurement |
| grad_student_new.txt |  | 0.74 | marketing_manager | yes | yes | product_manager marketing_manager |
| pivot_phd_hci.txt |  | 0.81 | program_manager | yes | yes |  |
| senior_pm_pdf_layout.txt |  | 0.76 | product_manager | no | no | product_manager |
| staff_pm_terse.txt |  | 0.36 | product_strategy | no | no | product_manager |
| template_placeholder_years.txt |  | 0.90 | corporate_banking | yes | yes |  |
| bizdev_beamjobs_1.pdf | bizdev | 0.69 | bizdev | yes | yes | bizdev |
| bizops_enhancv_1.txt | bizops | 0.77 | operations_manager | yes | yes | operations_manager |
| brand_manager_beamjobs_2.pdf | brand_manager | 0.87 | brand_manager | no | yes | brand_manager market_research |
| business_analytics_resumetemplate_2.pdf | business_analytics | 0.57 | business_intelligence | yes | yes | data_analyst |
| business_intelligence_resumecat_1.pdf | business_intelligence | 0.84 | business_intelligence | yes | yes | business_intelligence |
| category_manager_resumecat_1.pdf | category_manager | 0.69 | category_manager | yes | yes | category_manager |
| chief_of_staff_resumetemplate_2.docx | chief_of_staff | 0.84 | chief_of_staff | no | yes | chief_of_staff operations_manager |
| commercial_banking_rm_resumementor_1.txt | commercial_banking_rm | 0.90 | commercial_banking_rm | yes | yes | commercial_banking_rm enterprise_risk |
| compliance_universityofwa_1.pdf | compliance | 0.73 | compliance | yes | yes |  |
| corp_strategy_analyst_resumecat_1.pdf | corp_strategy_analyst | 0.77 | program_manager | yes | yes | corp_strategy_analyst |
| corporate_banking_resumementor_1.txt | corporate_banking | 0.84 | financial_manager | yes | yes | financial_manager |
| digital_transformation_beamjobs_1.pdf | digital_transformation | 0.92 | operations_manager | yes | yes | project_manager |
| enterprise_risk_resumebuilderc_2.docx | enterprise_risk | 0.98 | enterprise_risk | yes | yes | enterprise_risk |
| financial_manager_resumetemplate_1.pdf | financial_manager | 0.98 | fpa | yes | yes | financial_manager |
| fpa_resumetemplate_3.pdf | fpa | 0.99 | fpa | yes | yes | fpa |
| general_manager_floridagulfcoa_1.docx | general_manager | 0.52 | bizdev | yes | yes | communications treasury |
| general_manager_resumetemplate_2.docx | general_manager | 0.92 | general_manager | yes | yes | general_manager |
| growth_manager_enhancv_1.txt | growth_manager | 0.80 | marketing_manager | yes | yes | growth_manager demand_gen marketing_manager |
| hr_manager_resumetemplate_3.txt | hr_manager | 0.52 | hr_manager | yes | yes | hr_manager |
| ib_associate_enhancv_1.txt | ib_associate | 0.84 | ib_associate | yes | yes | ib_associate financial_manager |
| investment_manager_enhancv_1.txt | investment_manager | 0.65 | product_strategy | no | no | investment_manager |
| ldp_beamjobs_1.pdf | ldp | 0.85 | marketing_manager | no | no | public_policy marketing_manager |
| ldp_resumetemplate_2.docx | ldp | 0.87 | commercial_banking_rm | yes | yes | commercial_banking_rm |
| ldp_universityofio_1.docx | ldp | 0.77 | corp_strategy_analyst | yes | yes |  |
| management_consultant_resumebuilderc_1.pdf | management_consultant | 0.92 | management_consultant | yes | yes | management_consultant |
| management_consultant_universityofco_1.pdf | management_consultant | 0.77 | customer_success | yes | yes | demand_gen customer_success project_manager |
| marketing_manager_hofstraunivers_2.pdf | marketing_manager | 0.54 | marketing_manager | yes | yes | marketing_manager |
| operations_manager_resumecat_1.pdf | operations_manager | 0.74 | operations_manager | yes | yes | operations_manager |
| opex_resumecat_1.pdf | opex | 0.72 | opex | yes | yes | opex |
| partnerships_beamjobs_1.pdf | partnerships | 0.80 | marketing_manager | yes | yes | marketing_manager |
| pe_associate_financialedget_1.pdf | pe_associate | 0.89 | corp_dev | yes | yes |  |
| pm_enhancv_1.txt |  | 0.72 | product_strategy | no | no | product_manager |
| pm_resumecat_3.pdf |  | 0.74 | product_manager | no | no | product_manager |
| pmm_beamjobs_1.pdf | pmm | 0.51 | pmm | yes | yes | pmm |
| pmm_resumetemplate_2.docx | pmm | 0.81 | pmm | yes | yes | pmm |
| product_analyst_cvcompiler_1.txt |  | 0.77 | corp_strategy_analyst | yes | yes | data_analyst |
| product_ops_resumebuilderc_3.pdf |  | 0.68 | operations_manager | yes | yes | operations_manager |
| product_owner_resumebuilderc_2.pdf |  | 0.70 | product_strategy | no | no | product_manager |
| product_strategy_resumementor_2.txt | product_strategy | 0.75 | product_strategy | no | no | product_strategy |
| program_manager_resumetemplate_1.pdf | program_manager | 0.72 | program_manager | yes | yes | program_manager project_manager |
| re_acquisitions_kickresume_1.txt | re_acquisitions | 0.74 | treasury | no | yes | treasury |
| re_development_coloradostateu_1.pdf | re_development | 0.94 | corp_strategy_analyst | yes | yes |  |
| strategic_finance_huntr_1.txt | strategic_finance | 0.81 | fpa | yes | yes | financial_manager treasury |
| strategic_sourcing_resumecat_1.pdf | strategic_sourcing | 0.80 | strategic_sourcing | yes | yes | strategic_sourcing |
| strategy_manager_resumecat_2.pdf | strategy_manager | 0.86 | management_consultant | yes | yes |  |
| supply_chain_universityofrh_1.pdf | supply_chain | 0.81 | operations_manager | yes | yes |  |
| tech_strategy_resumecat_1.pdf | tech_strategy | 0.79 | program_manager | yes | yes |  |
| tpm_resumebuilderc_1.pdf |  | 0.86 | program_manager | yes | yes |  |
| transformation_beamjobs_2.pdf | transformation | 0.87 | opex | yes | yes | data_analyst |
| transformation_resumetemplate_1.pdf | transformation | 0.91 | customer_success | yes | yes |  |
| vc_associate_huntr_1.txt | vc_associate | 0.70 | vc_associate | yes | yes |  |
