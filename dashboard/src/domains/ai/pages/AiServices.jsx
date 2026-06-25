import React from 'react';
import Workspace, { HeaderZone, StatusZone, KpiTile } from '../../../shared/layouts/Workspace.jsx';
import Panel from '../../../shared/primitives/Panel.jsx';
import DataSlab from '../../../shared/primitives/DataSlab.jsx';
import { useLanguage } from '../../../shared/context/LanguageContext.jsx';

export default function AiServicesPage() {
  const { t } = useLanguage();

  return (
    <Workspace>
      <HeaderZone
        title={t("AI OPERATIONS CONSOLE")}
        subtitle={t("Manage neural command parsing, automated chat responses, and context window configurations.")}
      />
      <StatusZone>
        <KpiTile label={t("Model Engine")} value="GPT-4O-MINI" sub={t("SYS_MODEL_ID")} />
        <KpiTile label={t("Agent Tokens Used")} value="128,401" sub={t("TODAY_API_TOKENS")} />
        <KpiTile label={t("LLM Response Latency")} value="185ms" sub={t("AVERAGE_API_PINGS")} />
      </StatusZone>
      <div className="grid-12">
        <div className="col-span-12">
          <Panel title={t("AI NEURAL ENGINE PARAMETERS")} accent>
            <DataSlab label={t("Automated Intent Classification")} value={t("ACTIVE")} sub={t("Dynamic message routing toggle")} highlight />
            <DataSlab label={t("Semantic Context Limit")} value={`10 ${t("Messages")}`} sub={t("Chat history retrieval size")} />
          </Panel>
        </div>
      </div>
    </Workspace>
  );
}
