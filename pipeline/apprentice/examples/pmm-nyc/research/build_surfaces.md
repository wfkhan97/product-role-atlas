# Agentio: what a student could build against

## Agentio's own public surfaces

- **Marketing site (agentio.com).** Navigation is For brands, For creators, Resources (blog), Case Studies, Careers, Contact, Sign In and "Start Monetizing with Agentio" (app.agentio.com/join). No pricing page, help center, developer docs, API reference, newsletter form, changelog or community link exists; "Request a demo" is a form with no visible action URL [1]. Free. Demo use: rebuild the brand-side landing page for a new vertical and A/B the copy.
- **Creator sign-up (app.agentio.com/join).** "Join for free as a creator or manager"; "No outreach. No cold pitches. No fees." Only YouTube and Instagram are named; no subscriber minimum is published [2]. The join page is a JavaScript app that renders only "Loading..." to a plain fetch [3]. TechCrunch reported the platform "invite-only on both ends" with ~50 brands and 1,000+ creators in Nov 2024 [10]. Demo use: a mock creator-onboarding flow (connect channel, see offers) that a student can wireframe from the published copy alone.
- **Shopify app ("Agentio").** Free to install, launched 8 Nov 2024, zero reviews; reads customer, order and discount-code data for conversion tracking and ROAS [4]. Demo use: a one-page explainer or install-flow mockup for Shopify merchants, the one place Agentio has a public app listing.
- **Blog (24 posts, undated).** Includes "A Guide to Measuring YouTube Creator Advertising", the "2026 YouTube Creator Marketing Playbook", the engaged-view analysis (60% of new YouTube views are engaged; brands buying on views overpay 67%) and "Why Agentio Is Built as a Closed Creator Marketplace" [5][8]. Free. Demo use: a calculator that turns the blog's rules (amortize over 90 days, 1.5x–3x pixel-ROAS multiplier, creators ≥5% of budget) into an interactive worksheet [8].
- **Case studies (7).** Bombas 5.3x ROAS, Turo 435 creators in a year, Maev +18pt brand consideration, Graza "half the contracted CPM", Outloud <20h deal acceptance [6]. Demo use: benchmark table or a case-study generator template.
- **Fairing integration post.** Creator roster syncs into Fairing's post-purchase survey; responses return with order IDs deduplicated against pixel sales; "up to 73%" of survey-attributed orders were net-new [9]. Demo use: a survey-attribution dashboard mock.
- **Careers.** ~15 open roles in NY (Senior Software Engineer, Account Manager, Marketing Science Lead) on Built In NYC [11].
- **Social.** X @agentiohq and LinkedIn company/agentio-hq are the only community surfaces linked [1].

## Adjacent public APIs and datasets

- **YouTube Data API v3** — developers.google.com/youtube/v3 — free; every Google Cloud project gets 10,000 quota units/day, list reads cost 1 unit, search 100 [12]. Demo use: pull a channel's last 50 uploads with view counts and build a "creator inventory card" like Agentio's dashboard.
- **YouTube Creator Partnerships** (formerly BrandConnect) — blog.youtube — in YouTube Studio for creators, Google Ads/DV360 for brands; reaches "more than 3 million" YPP creators; an "expanded Creator Partnerships API" is for "select partners" only [13]. Demo use: a competitive teardown of YouTube's own marketplace vs Agentio's closed one.
- **Meta Partnership Ads API** — developers.facebook.com/docs/marketing-api/ad-creative/partnership-ads — public docs, free to read; covers creator permissions and running ads from a creator's handle [14]. Demo use: explain Agentio's Meta launch against the primitive it sits on.
- **Google Meridian** — github.com/google/meridian — Apache-2.0 Python MMM, `pip install google-meridian` [15]; **Meta Robyn** — github.com/facebookexperimental/Robyn — MIT, R and Python [16]. Demo use: run a toy MMM on synthetic spend to illustrate Agentio's "use an MMM for channel budget" advice [8].
- **SponsorBlock database** — sponsor.ajay.app/database — crowdsourced sponsor-segment timestamps, CC BY-NC-SA 4.0, mirrored via sb-mirror [17]. Demo use: estimate ad-read length and placement across a niche.
- **Kaggle "French YouTubers"** — 125,095 rows flagging sponsored videos by description links [18]. Demo use: sponsorship-frequency analysis.
- **Social Blade** — free web stats; API only for business customers [19].
- **IAB "As-Is Measurement Landscape in the Creator Economy"** (29 Jan 2026, free PDF) and the 2025 ad-spend report ($37B, +26%) [20][21]. Demo use: cite as the measurement-gap framing.

## Competitors' public docs and pricing

- Press names CreatorIQ, Grin and Captiv8 as Agentio's software rivals [22].
- **CreatorIQ** — apidocs.creatoriq.com exists, but keys are issued by an account manager or via support@creatoriq.com; not self-serve [23][24].
- **Grin** — REST API documented at api.grin.co (third-party listing); no published pricing, Capterra lists $999/mo [25].
- **Collabstr** — collabstr.com/pricing is public: free tier with a 10% hiring fee, Premium $333/mo at 5%, creators pay 15% [26]. Demo use: the one competitor with open creator rates to benchmark a pricing page against.
- **Aspire, Captiv8, Later Influence** — "contact vendor" pricing, no public API docs found [27][28].

## Public content a student can analyze or rewrite

The blog, the seven case studies, the Shopify listing, the creator page copy, the Series B post (customers Uber, DoorDash, Mint Mobile, CashApp, Olipop; $40M led by Forerunner, $56M total, $340M valuation) [6][7][9]. All free, none gated.

## What is NOT public

- No public API, SDK, developer docs, sandbox, changelog, help center, status page, Discord/Slack/forum, newsletter, podcast or webinar series found [1][5].
- No pricing; the brand-side fee is not on the site [1]. Access is invite-only and the marketplace is deliberately closed; creators connect channels "by API" to Agentio, not the other way round [7][10].
- No "Agentio Brand Partners" perk found: the phrase is absent from the creators page and from web search results [2].
- No G2 reviews, no LinkedIn follower count surfaced [11].

## Sources

1. Agentio homepage — https://agentio.com — read 2026-10-26
2. Agentio for creators — https://agentio.com/creators — read 2026-10-26
3. Agentio join (renders "Loading...") — https://app.agentio.com/join — read 2026-10-26
4. Agentio on Shopify App Store — https://apps.shopify.com/agentio — read 2026-10-26
5. Agentio blog index — https://agentio.com/blog — read 2026-10-26
6. Agentio case studies — https://agentio.com/case-studies — read 2026-10-26
7. Why Agentio Is Built as a Closed Creator Marketplace — https://www.agentio.com/blog/why-agentio-is-built-as-a-closed-creator-marketplace — read 2026-10-26
8. A Guide to Measuring YouTube Creator Advertising — https://www.agentio.com/blog/measurement-guide — read 2026-10-26
9. Fairing x Agentio Native Integration — https://www.agentio.com/blog/unlocking-creator-roas-introducing-fairing-x-agentio-native-integration — read 2026-10-26
10. TechCrunch, Agentio raises $12M from Benchmark — https://techcrunch.com/2024/11/19/agentio-raises-12-million-from-benchmark-for-its-youtube-ad-marketplace — read 2026-10-26
11. Built In NYC, Jobs at Agentio — https://www.builtinnyc.com/company/agentio/jobs — read 2026-10-26
12. YouTube Data API Overview (quota) — https://developers.google.com/youtube/v3/getting-started — read 2026-10-26
13. YouTube blog, Creator Partnerships at NewFronts 2026 — https://blog.youtube/news-and-events/youtube-creator-partnerships-newfronts-2026/ — read 2026-10-26
14. Meta Partnership Ads API — https://developers.facebook.com/docs/marketing-api/ad-creative/partnership-ads — read 2026-10-26
15. Google Meridian — https://github.com/google/meridian — read 2026-10-26
16. Meta Robyn — https://github.com/facebookexperimental/Robyn — read 2026-10-26
17. SponsorBlock database — https://sponsor.ajay.app/database — read 2026-10-26
18. Kaggle French YouTubers dataset (mirror) — https://baselight.app/u/kaggle/dataset/weddou_french_youtubers — read 2026-10-26
19. Social Blade info — https://socialblade.com/info — read 2026-10-26
20. IAB, As-Is Measurement Landscape in the Creator Economy — https://www.iab.com/guidelines/creator-economy-as-is-measurement-landscape/ — read 2026-10-26
21. IAB 2025 Creator Economy Ad Spend & Strategy Report — https://www.iab.com/insights/2025-Creator-economy-ad-spend-strategy-report — read 2026-10-26
22. Yespress, Agentio profile (competitors) — https://yespress.io/agentio — read 2026-10-26
23. CreatorIQ API docs portal — https://apidocs.creatoriq.com — read 2026-10-26
24. Improvado, CreatorIQ connector (key via account manager) — https://improvado.io/docs/creatoriq — read 2026-10-26
25. apis.io, Grin API listing — https://apis.io/providers/grin/ — read 2026-10-26
26. Collabstr pricing — https://collabstr.com/pricing — read 2026-10-26
27. G2, Aspire pricing (not provided) — https://g2.com/products/aspireiq-aspire/pricing — read 2026-10-26
28. Capterra, Captiv8 (contact vendor) — https://www.capterra.com/p/234955/Captiv8/ — read 2026-10-26
