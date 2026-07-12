export const demoActivities = [
  {
    id: "evt-001",
    type: "meeting.booked",
    contact: "Amina Cole",
    campaign: "Nordic outbound",
    source: "Calendly",
    occurredAt: "2026-07-10T08:30:00Z",
    status: "confirmed",
  },
  {
    id: "evt-002",
    type: "meeting.booked",
    contact: "Jon Bell",
    campaign: "Nordic outbound",
    source: "Calendly",
    occurredAt: "2026-07-09T13:10:00Z",
    status: "confirmed",
  },
  {
    id: "evt-003",
    type: "meeting.canceled",
    contact: "Sam Rivera",
    campaign: "US founders",
    source: "Calendly",
    occurredAt: "2026-07-09T15:45:00Z",
    status: "canceled",
  },
  {
    id: "evt-004",
    type: "call.completed",
    contact: "Amina Cole",
    campaign: "Nordic outbound",
    source: "Close CRM",
    occurredAt: "2026-07-08T10:20:00Z",
    status: "completed",
  },
  {
    id: "evt-005",
    type: "email.replied",
    contact: "Priya Shah",
    campaign: "US founders",
    source: "Instantly",
    occurredAt: "2026-07-07T16:00:00Z",
    status: "positive",
  },
  {
    id: "evt-006",
    type: "opportunity.won",
    contact: "Priya Shah",
    campaign: "US founders",
    source: "Close CRM",
    occurredAt: "2026-07-06T09:00:00Z",
    status: "won",
    amount: 12500,
  },
] as const;

export const demoTrend = [12, 18, 15, 24, 21, 29, 34, 31, 38, 42, 39, 47];

export const starterMetrics = [
  {
    name: "Meetings booked",
    description: "Count of meeting.booked activities",
    value: 47,
    change: 12,
    type: "meeting.booked",
  },
  {
    name: "Calls completed",
    description: "Count of call.completed activities",
    value: 31,
    change: 4,
    type: "call.completed",
  },
  {
    name: "Email reply rate",
    description: "Email replies divided by emails delivered",
    value: 8.4,
    change: -0.6,
    suffix: "%",
    type: "email.replied",
  },
  {
    name: "Revenue won",
    description: "Sum of amount for opportunity.won",
    value: 62500,
    change: 18,
    prefix: "$",
    type: "opportunity.won",
  },
] as const;

export const demoModeLabel = "Local fixture preview — never shown as customer data in production";
