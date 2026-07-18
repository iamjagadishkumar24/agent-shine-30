import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAgentsTool from "./tools/list-agents";
import listFeedbackTool from "./tools/list-feedback";
import getFeedbackTool from "./tools/get-feedback";
import createFeedbackTool from "./tools/create-feedback";
import updateFeedbackStatusTool from "./tools/update-feedback-status";
import listCoachingSessionsTool from "./tools/list-coaching-sessions";
import whoAmITool from "./tools/whoami";

// Direct Supabase issuer (project ref survives publish; SUPABASE_URL may be proxied).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "signal-qms-mcp",
  title: "Signal QMS",
  version: "0.1.0",
  instructions:
    "Tools for the Signal QMS quality management platform. Read agents, browse and create feedback, and view coaching sessions. All calls act as the signed-in user and respect their role and RLS policies.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoAmITool,
    listAgentsTool,
    listFeedbackTool,
    getFeedbackTool,
    createFeedbackTool,
    updateFeedbackStatusTool,
    listCoachingSessionsTool,
  ],
});
