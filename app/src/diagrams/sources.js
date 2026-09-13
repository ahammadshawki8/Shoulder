/**
 * The mermaid source of every diagram in the app.
 *
 * The app does not ship mermaid. These are drawn ahead of time, in the app's
 * own colours for both themes, into public/diagrams/<name>-<theme>.svg by the
 * export page: run `npm run dev`, open http://localhost:5174/diagrams.html, and
 * press "Save all". Edit a source here, then export again.
 */

const MONTH = `flowchart LR
  A["Everyone adds what<br/>they can and cannot do"] --> B["Shoulder works out<br/>the fairest split"]
  B --> C{"Fair enough?"}
  C -->|Yes| D["The plan appears<br/>in Tasks"]
  C -->|No| E["One decision<br/>in Needs you"]
  E --> F["The answer becomes<br/>an agreement"]
  F -.->|next month| B`;

const PRIVACY = `flowchart LR
  L["Days and kinds of<br/>work you cannot do"] --> F[("Family record")]
  R["Your reasons and<br/>agent instructions"] --> T[("Kept apart,<br/>read only for you")]
  F --> O["What your family sees"]
  F --> Y["What you see"]
  T --> Y
  A["Your agent's messages"] --> H(["Privacy check in code"])
  H -->|"nothing that gives<br/>a reason away"| O`;

const BUILT = `flowchart LR
  UI["Family app<br/>in the browser"] -->|"httpOnly cookie"| API["Shoulder server<br/>sessions and one<br/>view per person"]
  API --> DB[("SQLite")]
  API --> ENG["Fairness engine<br/>no language model"]
  CON["Convener<br/>Strands graph"] --> ENG
  CON <-->|A2A| PA["One agent per person<br/>with privacy hook"]
  CON --> BR["Amazon Bedrock"]
  PA --> BR`;

export const DIAGRAMS = {
  month: { source: MONTH, label: "How a month gets shared, and where the family is asked." },
  privacy: { source: PRIVACY, label: "Where what you tell Shoulder goes, and what reaches your family." },
  built: { source: BUILT, label: "The family app, its server, and the Strands Agents negotiation." },
};
