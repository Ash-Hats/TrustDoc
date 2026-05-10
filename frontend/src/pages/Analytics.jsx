import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, ChartLine, ShieldCheck, WalletCards } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import {
  buildAnalyticsSummary,
  buildIssuerActivity,
  buildVerificationTrend,
} from "../services/analyticsService";
import Card from "../components/ui/Card";

const CHART_COLORS = {
  violet: "#8b5cf6",
  cyan: "#22d3ee",
  emerald: "#34d399",
  rose: "#fb7185",
  amber: "#fbbf24",
};

function MetricCard({ title, value, subtitle, icon: Icon, glow }) {
  return (
    <Card className={["transition-all duration-300 hover:-translate-y-1", glow].join(" ")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-gray-400">{title}</p>
          <p className="mt-3 text-2xl font-bold text-gray-100">{value}</p>
          <p className="mt-2 text-xs text-gray-400">{subtitle}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-gray-100">
          <Icon size={19} />
        </span>
      </div>
    </Card>
  );
}

export default function Analytics() {
  const { documents, verificationHistory, pendingTransactions, activity } = useAppContext();

  const summary = buildAnalyticsSummary(documents, verificationHistory, pendingTransactions);
  const trendData = buildVerificationTrend(documents, verificationHistory, 14);
  const issuerData = buildIssuerActivity(documents);

  const fraudPieData = [
    { name: "Verified", value: Math.max(0, summary.successfulVerifications), color: CHART_COLORS.emerald },
    { name: "Failed", value: Math.max(0, summary.failedVerifications), color: CHART_COLORS.rose },
    { name: "Revoked", value: Math.max(0, summary.revokedDocs), color: CHART_COLORS.amber },
  ];

  const activityCounters = activity.reduce(
    (acc, item) => {
      if (item.type === "wallet") {
        acc.wallet += 1;
      } else if (item.type === "transaction") {
        acc.transactions += 1;
      } else if (item.type === "error") {
        acc.errors += 1;
      }
      return acc;
    },
    { wallet: 0, transactions: 0, errors: 0 }
  );

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold text-transparent">
          Analytics
        </h2>
        <p className="mt-2 text-sm text-gray-400">
          Live verification trends, fraud signals, issuer performance, and wallet activity.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Success Rate"
          value={`${summary.successRate}%`}
          subtitle="Verification success ratio"
          icon={ShieldCheck}
          glow="hover:shadow-glow-emerald"
        />
        <MetricCard
          title="Verification Volume"
          value={summary.successfulVerifications + summary.failedVerifications}
          subtitle="Total verification requests"
          icon={ChartLine}
          glow="hover:shadow-glow-cyan"
        />
        <MetricCard
          title="Fraud Alerts"
          value={summary.fraudAlerts}
          subtitle="Failed + revoked incidents"
          icon={AlertTriangle}
          glow="hover:shadow-glow-rose"
        />
        <MetricCard
          title="Wallet Activity"
          value={activityCounters.wallet + activityCounters.transactions}
          subtitle="Wallet + tx interactions"
          icon={WalletCards}
          glow="hover:shadow-glow-violet"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Card>
            <h3 className="text-lg font-semibold text-gray-100">Verification Trends (14 Days)</h3>
            <p className="mt-1 text-xs text-gray-400">Registered vs verified proof activity.</p>
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,17,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.25)",
                      borderRadius: "10px",
                      color: "#e5e7eb",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="registered"
                    stroke={CHART_COLORS.violet}
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="verified"
                    stroke={CHART_COLORS.cyan}
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
          <Card>
            <h3 className="text-lg font-semibold text-gray-100">Fraud Alerts</h3>
            <p className="mt-1 text-xs text-gray-400">Verification and revocation signal mix.</p>
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fraudPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={4}
                  >
                    {fraudPieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,17,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.25)",
                      borderRadius: "10px",
                      color: "#e5e7eb",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-400">
              {fraudPieData.map((item) => (
                <div key={item.name} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <p style={{ color: item.color }} className="font-semibold">
                    {item.value}
                  </p>
                  <p>{item.name}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h3 className="text-lg font-semibold text-gray-100">Issuer Activity</h3>
          <p className="mt-1 text-xs text-gray-400">Most active document issuers from your records.</p>
          <div className="mt-5 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={issuerData.length ? issuerData : [{ issuer: "No data", count: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="issuer" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,17,23,0.95)",
                    border: "1px solid rgba(148,163,184,0.25)",
                    borderRadius: "10px",
                    color: "#e5e7eb",
                  }}
                />
                <Bar dataKey="count" fill={CHART_COLORS.violet} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-gray-100">Wallet + Tx Activity</h3>
          <p className="mt-1 text-xs text-gray-400">Recent operational footprint in-app.</p>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Wallet Events</p>
              <p className="mt-1 text-2xl font-bold text-gray-100">{activityCounters.wallet}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Transaction Events</p>
              <p className="mt-1 text-2xl font-bold text-gray-100">{activityCounters.transactions}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Error Events</p>
              <p className="mt-1 text-2xl font-bold text-gray-100">{activityCounters.errors}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs uppercase tracking-wide text-gray-400">Pending Transactions</p>
              <p className="mt-1 text-2xl font-bold text-gray-100">{summary.pendingTransactions}</p>
            </div>
          </div>
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
            <Activity size={14} />
            Analytics stream updates live with dashboard polling and tx watchers.
          </div>
        </Card>
      </div>
    </section>
  );
}
