# Apprentice map · intake

Worked through in conversation with the student in week 0 of the cohort. The owner asks; the student answers; the
answers are written under each question. The short answers in the block below are what the scripts read; the prose
sections are what the model reads. Nothing in this file is sent anywhere: it stays in `data/apprentice/students/<slug>/`,
which is gitignored.

```yaml
slug:
roles:                # one to three atlas role ids in one field, comma-separated; the first is the map's role (roles_mba.json: pmm, marketing_manager, growth_manager, product_manager, …)
campus: Cornell Tech  # or "IE New York" (no class roster is loaded for IE)
program:              # e.g. Johnson Cornell Tech MBA
companies:            # one to three, comma-separated; the map is built on the first
company_url:
posting_url:
posting_title:
current_courses:      # course codes of the current term, comma-separated
spring_courses:       # Spring 2027 course codes, comma-separated
hours_per_week:
graduation:           # month and year, e.g. May 2027
visa_deadline:        # month and year, or none
name_on_page:         # a made-up name; never the student's own (check.mjs refuses a name that appears in section 3)
```

## 1. The role and the companies

### Which role are you going for, and what does a good first year in it look like to you? Which one or two roles in the same field would you also take?

### Which one to three companies would you take that role at tomorrow? Why those?

### Of the three, which one first? (The map is built on that one.)

## 2. The posting

### Paste one real, currently open posting for the role at the first company: the text, then its URL and title on their site.

## 3. Background

### Paste your résumé text or your LinkedIn summary, as it is. (This is what the atlas matcher reads; the page never shows it.)

## 4. What you have built

### What have you built, shipped, written or run that other people used? Numbers if you have them.

### What have you never done that this role does every week?

## 5. Coursework

### Which classes are you in this term? Which ones are you planning for Spring 2027? Codes, please.

### Which assignment this term could become something public with another week of work?

## 6. The strangest fit

### What is the strangest part of your background that fits this company's bet? (The thing no other applicant has.)

## 7. Constraints

### How many hours a week can you give this, honestly?

### When do you graduate? Is there a visa or other deadline (month only)?

## 8. The name on the page

### The page replaces your name with a made-up one. Which?

## 9. More about you

### Anything else that shows how you work: a side project, a talk, an essay you wrote for a program application, a thing you run. Paste it or describe it, and say what it was for and when. (The map's story cards and the read use it; the page never shows it.)
