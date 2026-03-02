# UML Diagrams — Supademo Integration v2.0

All diagrams in Mermaid format. Render at https://mermaid.live or in any Mermaid-compatible viewer.

---

## 1. Use Case Diagram

```mermaid
graph TB
    subgraph "Agile Intel — Supademo Integration"
        subgraph Actors
            Prospect[Prospective Customer]
            GovProspect[Government CISO]
            SalesRep[Sales Representative]
            FedSales[Federal Sales Specialist]
            Marketing[Marketing Manager]
        end
        subgraph "Use Cases"
            UC1[View Interactive Demo]
            UC2[Capture Lead Information]
            UC3[Track Demo Engagement]
            UC4[Calculate Lead Score]
            UC5[Sync to HubSpot CRM]
            UC6[Send High-Intent Alerts]
            UC7[View Analytics Dashboard]
            UC8[Download FedRAMP Docs]
            UC9[Route Government Prospects]
            UC10[Download White Paper]
            UC11[Register for Webinar]
        end
        subgraph "External Systems"
            Supademo[(Supademo)]
            HubSpot[(HubSpot CRM)]
            Slack[(Slack)]
        end
        Prospect --> UC1
        Prospect --> UC2
        Prospect --> UC10
        Prospect --> UC11
        GovProspect --> UC8
        UC1 --> UC3
        UC3 --> UC4
        UC4 --> UC5
        UC5 --> HubSpot
        UC4 --> UC6
        UC6 --> Slack
        UC6 --> SalesRep
        UC8 --> UC9
        UC9 --> FedSales
        Marketing --> UC7
        UC1 -.-> Supademo
    end
```

---

## 2. Activity Diagram — Demo Viewing Flow

```mermaid
graph TD
    Start([Prospect Visits Website]) --> Select{Select Demo Type}
    Select -->|Core| Load[Load Demo Iframe]
    Select -->|AI Agents| Load
    Select -->|Security| Load
    Select -->|Government| Load
    Load --> Email{Email Capture?}
    Email -->|Yes| Validate[Validate Email]
    Email -->|Skip| Play[Start Demo]
    Validate -->|Valid| Create[Create Lead Record]
    Validate -->|Invalid| Error[Show Error] --> Email
    Create --> Play
    Play --> Track[Track Interactions]
    Track --> Status{Completion?}
    Status -->|100%| Complete[Demo Completed]
    Status -->|25-99%| Partial[Partial Completion]
    Status -->|<25%| Abandon[Abandoned]
    Complete --> Webhook[Fire Webhook]
    Partial --> Webhook
    Abandon --> Reengage[Send Re-engagement Email]
    Webhook --> Verify{HMAC Valid?}
    Verify -->|Yes| Score[Calculate Lead Score]
    Verify -->|No| Reject[Reject 401]
    Score --> Check{Score >= 50?}
    Check -->|High Intent| HI[Create HubSpot Task + Slack Alert]
    Check -->|Low Intent| LI[Create HubSpot Contact]
    HI --> CTA[Show Schedule Demo CTA]
    LI --> CTA
    Reengage --> End([End])
    CTA --> End
    Reject --> End
```

---

## 3. Class Diagram

```mermaid
classDiagram
    class SupademoDemo {
        +UUID DemoId
        +String SupademoDemoId
        +String DemoName
        +String DemoType
        +String DemoURL
        +String EmbedCode
        +Boolean IsActive
    }
    class DemoEngagement {
        +UUID EngagementId
        +UUID DemoId
        +String ProspectEmail
        +String CompanyName
        +Int TimeSpent
        +Decimal CompletionPercentage
        +Int LeadScore
        +Boolean IsHighIntent
        +Boolean IsGovernmentProspect
        +String HubSpotContactId
        +String LandingPage
    }
    class DemoAnalytics {
        +UUID AnalyticsId
        +UUID DemoId
        +Date Date
        +Int TotalViews
        +Int HighIntentLeads
    }
    class MarketingCampaign {
        +UUID CampaignId
        +String CampaignName
        +String CampaignType
        +Int LeadsGenerated
        +Decimal RevenueInfluenced
    }
    class SupademoService {
        +trackDemoView()
        +calculateLeadScore()
        +handleHighIntentLead()
        +isGovernmentEmail()
        +syncToHubSpot()
        +getDemoAnalytics()
    }
    class SupademoController {
        +handleWebhook()
        +captureLead()
        +getAnalytics()
        +listDemos()
    }
    class HubSpotService {
        +createOrUpdateContact()
        +createTask()
        +addToList()
    }
    SupademoDemo "1" --> "*" DemoEngagement
    SupademoDemo "1" --> "*" DemoAnalytics
    DemoEngagement --> HubSpotService : syncs to
    SupademoService --> HubSpotService : uses
    SupademoController --> SupademoService : delegates
```

---

## 4. Sequence Diagram — High-Intent Lead Flow

```mermaid
sequenceDiagram
    participant P as Prospect
    participant S as Supademo
    participant W as Webhook Handler
    participant SV as SupademoService
    participant DB as Azure SQL
    participant HS as HubSpot
    participant SL as Slack
    participant SR as Sales Rep

    P->>S: View Demo (6 min, 80%)
    S->>W: POST /webhooks/supademo (demo.completed)
    W->>W: Verify HMAC Signature
    W->>SV: handleDemoCompleted(data)
    SV->>DB: INSERT DemoEngagement
    DB-->>SV: EngagementId
    SV->>SV: calculateLeadScore() = 72
    SV->>DB: UPDATE LeadScore=72, IsHighIntent=1
    par Parallel Actions
        SV->>HS: Create Contact
        SV->>HS: Create Task (Call within 24h)
        SV->>HS: Add to Hot Leads list
        SV->>SL: POST notification
        SL->>SR: Alert
    end
    SV-->>W: Success
    W-->>S: 200 OK
    SR->>P: Call within 24 hours
```

---

## 5. State Machine Diagram — Engagement Lifecycle

```mermaid
stateDiagram-v2
    [*] --> NotStarted: Demo Link Shared
    NotStarted --> EmailCapture: Clicks Link
    EmailCapture --> Viewing: Email Provided or Skipped
    state Viewing {
        [*] --> Step1
        Step1 --> Step2: Next
        Step2 --> StepN: ...
        StepN --> [*]: All Steps
    }
    Viewing --> Completed: 100%
    Viewing --> PartiallyCompleted: 25-99%
    Viewing --> Abandoned: <25%
    state Completed {
        [*] --> ScoreCalc
        ScoreCalc --> HighIntent: Score >= 50
        ScoreCalc --> LowIntent: Score < 50
        HighIntent --> HubSpotSynced: Task + Alert
        LowIntent --> HubSpotSynced: Contact Only
    }
    PartiallyCompleted --> ReengagementEmail
    Abandoned --> ReengagementEmail
    ReengagementEmail --> Viewing: Returns
    ReengagementEmail --> Closed: No Response (30d)
    HubSpotSynced --> Qualified: Meeting Scheduled
    HubSpotSynced --> Disqualified: Not Interested
    Qualified --> [*]
    Disqualified --> [*]
    Closed --> [*]
```

---

## 6. Component Diagram

```mermaid
graph TB
    subgraph "Frontend (React)"
        DemoPage[Demo Page]
        DemoEmbed[Demo Embed]
        Landing[Landing Pages x6]
        Analytics[Analytics Dashboard]
    end
    subgraph "Backend (Node.js/TypeScript)"
        Routes[Express Routes]
        Middleware[Webhook Auth]
        Controller[Supademo Controller]
        Service[Supademo Service]
        HSService[HubSpot Service]
    end
    subgraph "Data Layer"
        Models[Data Models]
        DB[(Azure SQL)]
    end
    subgraph "External"
        Supademo[Supademo SaaS]
        HubSpot[HubSpot CRM]
        Slack[Slack]
    end
    DemoPage --> DemoEmbed
    DemoEmbed -.iframe.-> Supademo
    Landing --> Routes
    Supademo -.webhooks.-> Routes
    Routes --> Middleware --> Controller --> Service
    Service --> HSService
    Service --> Models --> DB
    HSService --> HubSpot
    Service --> Slack
```

---

## 7. Deployment Diagram

```mermaid
graph TB
    subgraph "Azure Cloud"
        subgraph "App Service"
            WebApp[Node.js 18 LTS]
            AppInsights[Application Insights]
        end
        subgraph "Data"
            AzureSQL[(Azure SQL S1)]
        end
        subgraph "Security"
            KeyVault[Key Vault]
        end
        WebApp --> AzureSQL
        WebApp --> KeyVault
        WebApp --> AppInsights
    end
    subgraph "SaaS Platforms"
        Supademo[Supademo]
        HubSpot[HubSpot CRM]
        Slack[Slack]
    end
    subgraph "Clients"
        Browser[Web Browser]
    end
    Browser -->|HTTPS| WebApp
    Browser -->|iframe| Supademo
    Supademo -->|Webhooks| WebApp
    WebApp -->|REST API| HubSpot
    WebApp -->|Webhook| Slack
```
