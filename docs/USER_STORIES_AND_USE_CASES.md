# User Stories & Use Cases — Supademo Integration v2.0

---

## EPIC 1: DEMO VIEWING & ENGAGEMENT

### Story 1.1: Anonymous Demo Access (P0 — 3 SP)
**As a** prospective customer,
**I want to** view interactive demos without signing up,
**So that** I can evaluate Agile Intel quickly.

**Acceptance Criteria:**
- Demo loads within 3 seconds
- No login required
- Responsive on desktop, tablet, mobile
- URL is shareable

### Story 1.2: Email Capture (P0 — 5 SP)
**As a** marketing team member,
**I want to** capture prospect emails during demo viewing,
**So that** we can follow up with interested prospects.

**Acceptance Criteria:**
- Optional form at demo start (email, company, role)
- Email validation
- Privacy policy link displayed
- Synced to HubSpot within 1 minute

### Story 1.3: Multi-Demo Selection (P1 — 2 SP)
**As a** prospective customer,
**I want to** choose between demo types (Core, AI, Security, Government),
**So that** I see content relevant to my needs.

**Acceptance Criteria:**
- 4 demo options with descriptive titles
- Smooth transition between demos (<1s)
- Selection persists on return visits

---

## EPIC 2: LEAD INTELLIGENCE & SCORING

### Story 2.1: Automated Lead Scoring (P0 — 8 SP)
**As a** sales representative,
**I want to** automatically score leads based on engagement,
**So that** I prioritize high-intent prospects.

**Acceptance Criteria:**
- Formula: (time × 0.4) + (completion × 0.35) + (steps × 0.25)
- Range: 0–100
- High-intent threshold: 50 (commercial), 70 (government)
- Visible in HubSpot within 5 minutes

### Story 2.2: High-Intent Alerts (P0 — 5 SP)
**As a** sales representative,
**I want to** receive immediate notifications for high-intent leads,
**So that** I follow up while they're engaged.

**Acceptance Criteria:**
- Slack notification within 10 minutes
- HubSpot task: "Call within 24 hours" (HIGH priority)
- Includes: email, name, company, score, demo type

### Story 2.3: Government Prospect Detection (P1 — 3 SP)
**As a** federal sales specialist,
**I want to** auto-identify .gov/.mil prospects,
**So that** they route to our compliance team.

**Acceptance Criteria:**
- Detects .gov, .mil, .us, .state.* domains
- Auto-tags "Government Prospect" in HubSpot
- Sends FedRAMP documentation automatically

---

## EPIC 3: ANALYTICS & REPORTING

### Story 3.1: Demo Performance Dashboard (P1 — 8 SP)
**As a** marketing manager,
**I want to** view real-time demo performance metrics,
**So that** I optimize content and improve conversion.

**Acceptance Criteria:**
- Shows: total views, unique viewers, avg time, completion rate
- Filterable by demo type and date range
- Export to CSV

### Story 3.2: Lead Funnel Tracking (P2 — 13 SP)
**As a** sales operations manager,
**I want to** track demo viewers through the funnel,
**So that** I measure demo ROI.

**Acceptance Criteria:**
- Stages: Demo View → Trial → Opportunity → Closed Won
- Conversion rate per stage
- Revenue influenced by demos

---

## EPIC 4: INBOUND MARKETING ENGINE

### Story 4.1: Gartner-Compliant Landing Pages (P0 — 8 SP)
**As a** marketing team member,
**I want to** deploy 6 high-converting landing pages,
**So that** we capture leads from all traffic sources.

**Acceptance Criteria:**
- Trust bar with customer logos and Gartner badge
- Lead capture forms (2–3 fields max)
- Mobile responsive
- Schema.org markup for SEO
- Exit-intent popup

### Story 4.2: White Paper Lead Magnets (P1 — 5 SP)
**As a** content marketer,
**I want to** offer downloadable guides in exchange for email,
**So that** we grow our email list with qualified prospects.

**Acceptance Criteria:**
- 3 white papers: AI Agents Guide, FedRAMP Guide, ROI Calculator
- Automatic email delivery of PDF
- Download tracked in HubSpot

### Story 4.3: Email Nurture Campaigns (P1 — 8 SP)
**As a** demand generation manager,
**I want to** automatically nurture leads through email sequences,
**So that** we convert demo viewers to customers.

**Acceptance Criteria:**
- 4 campaigns: Welcome (5), High-Intent (7), Government (4), Re-engagement (3)
- Personalized by demo type and lead score
- HubSpot workflow automation

---

## USE CASE 1: SELF-SERVICE DEMO EVALUATION

**ID:** UC-001
**Actor:** Prospective Customer
**Goal:** Evaluate Agile Intel without sales interaction

**Main Flow:**
1. Prospect clicks "View Demo" on homepage
2. System displays demo selection with 4 options
3. Prospect selects "Core Platform"
4. Supademo iframe loads
5. Optional email capture form appears
6. Prospect enters email
7. Demo playback begins; prospect interacts with hotspots
8. Prospect views 80% of screens (6 minutes)
9. Supademo fires `demo.completed` webhook
10. System verifies HMAC signature
11. System calculates lead score: 72/100 (HIGH INTENT)
12. System creates HubSpot contact + task
13. System sends Slack notification
14. System shows "Schedule Demo" CTA

**Postconditions:** Engagement tracked, HubSpot synced, sales notified

---

## USE CASE 2: GOVERNMENT PROSPECT QUALIFICATION

**ID:** UC-002
**Actor:** Federal Agency CISO
**Goal:** Evaluate FedRAMP compliance without live system access

**Main Flow:**
1. CISO receives demo link from Agile Intel sales rep
2. System routes to Government/FedRAMP demo
3. CISO explores NIST 800-53 controls via hotspots
4. CISO clicks "View FedRAMP Documentation" hotspot
5. System presents PDF download (SSP, SAR, POA&M)
6. CISO completes 90% of demo (12 minutes)
7. System detects .gov email domain
8. System tags "Government Prospect" in HubSpot
9. System routes to federal sales specialist
10. Specialist notified within 30 minutes

**Postconditions:** Qualified as government prospect, routed to specialist
