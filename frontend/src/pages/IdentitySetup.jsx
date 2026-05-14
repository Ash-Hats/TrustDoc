import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronRight, User, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useAppContext } from "../context/AppContext";
import { completeProfileSetup, logAuditEvent, updateProfileStep } from "../services/supabaseService";
import { sanitizeText } from "../utils/security";
import { shortAddress } from "../utils/format";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";

const SETUP_STEPS = [
  {
    id: "identity",
    title: "Personal Identity",
    description: "Create your identity profile",
    icon: User,
  },
  {
    id: "organization",
    title: "Organization + Wallet",
    description: "Complete organization details and wallet link",
    icon: Building2,
  },
];

function StepIndicator({ steps, currentStep }) {
  return (
    <div className="mb-8 flex items-center gap-2">
      {steps.map((step, idx) => {
        const isActive = step.id === currentStep;
        const isCompleted = steps.findIndex((item) => item.id === currentStep) > idx;

        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                isCompleted
                  ? "border-emerald-400 bg-emerald-400/20"
                  : isActive
                    ? "border-violet-400 bg-violet-400/20"
                    : "border-gray-600 bg-transparent",
              ].join(" ")}
            >
              {isCompleted ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <span className="text-xs font-semibold text-gray-400">{idx + 1}</span>
              )}
            </div>
            {idx < steps.length - 1 ? (
              <div
                className={[
                  "h-0.5 w-12 transition-all",
                  isCompleted
                    ? "bg-emerald-400"
                    : isActive
                      ? "bg-violet-400/50"
                      : "bg-gray-600",
                ].join(" ")}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function IdentityStep({ formData, setFormData, onNext }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!formData.displayName?.trim()) {
          toast.error("Please enter your name.");
          return;
        }
        onNext();
      }}
      className="space-y-6"
    >
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Full Name *</label>
        <input
          type="text"
          value={formData.displayName}
          onChange={(event) => setFormData({ ...formData, displayName: event.target.value })}
          placeholder="John Doe"
          className="w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Bio (Optional)</label>
        <textarea
          value={formData.bio || ""}
          onChange={(event) => setFormData({ ...formData, bio: event.target.value })}
          placeholder="Tell us about yourself..."
          rows={4}
          maxLength={500}
          className="w-full resize-none rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        />
        <p className="mt-1 text-xs text-gray-400">{formData.bio?.length || 0}/500 characters</p>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1">
          <span>Next Step</span>
          <ChevronRight size={16} />
        </Button>
      </div>
    </form>
  );
}

function OrganizationStep({
  formData,
  setFormData,
  onPrevious,
  onComplete,
  onLinkWallet,
  isLinkingWallet,
  connectedWallet,
}) {
  return (
    <form onSubmit={onComplete} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">
          Organization/Company Name (Optional)
        </label>
        <input
          type="text"
          value={formData.organizationName || ""}
          onChange={(event) => setFormData({ ...formData, organizationName: event.target.value })}
          placeholder="Acme Corp"
          className="w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">Role (Optional)</label>
        <select
          value={formData.organizationRole || ""}
          onChange={(event) => setFormData({ ...formData, organizationRole: event.target.value })}
          className="w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-2.5 text-gray-100 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        >
          <option value="">Select a role...</option>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="director">Director</option>
          <option value="executive">Executive</option>
          <option value="founder">Founder</option>
          <option value="independent">Independent Professional</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-300">
          Profile Photo URL (Optional)
        </label>
        <input
          type="url"
          value={formData.profilePhotoUrl || ""}
          onChange={(event) => setFormData({ ...formData, profilePhotoUrl: event.target.value })}
          placeholder="https://example.com/photo.jpg"
          className="w-full rounded-lg border border-gray-600 bg-gray-900/50 px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
        />
      </div>

      <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-cyan-200">Wallet Linking</p>
        <p className="text-sm text-cyan-100">
          {formData.linkedWallet
            ? `Linked wallet: ${shortAddress(formData.linkedWallet)}`
            : connectedWallet
              ? `Connected wallet: ${shortAddress(connectedWallet)}`
              : "No wallet connected yet."}
        </p>
        <p className="mt-1 text-xs text-cyan-100/80">
          Link now to enforce ownership checks immediately after onboarding.
        </p>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={onLinkWallet} disabled={isLinkingWallet}>
            <Wallet size={14} />
            {isLinkingWallet ? "Linking Wallet..." : "Connect + Link Wallet"}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" onClick={onPrevious} variant="secondary" className="flex-1">
          Previous
        </Button>
        <Button type="submit" className="flex-1">
          Complete Setup
        </Button>
      </div>
    </form>
  );
}

export default function IdentitySetup() {
  const navigate = useNavigate();
  const { user, profile, session, linkWallet } = useAuth();
  const { wallet, connectWallet } = useAppContext();
  const [currentStep, setCurrentStep] = useState("identity");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLinkingWallet, setIsLinkingWallet] = useState(false);
  const [formData, setFormData] = useState({
    displayName: profile?.display_name || "",
    organizationName: profile?.organization_name || "",
    organizationRole: profile?.organization_role || "",
    profilePhotoUrl: profile?.profile_photo_url || "",
    bio: profile?.bio || "",
    linkedWallet: profile?.wallet_address || "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    if (profile?.setup_completed) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, profile?.setup_completed, user]);

  const persistStep = async (nextStep) => {
    if (!session?.accessToken || !user?.id) {
      return;
    }

    await updateProfileStep(session.accessToken, user.id, {
      step: nextStep,
      completed: false,
    }).catch(() => null);
  };

  const handleNext = async () => {
    await persistStep("organization");
    setCurrentStep("organization");
  };

  const handleLinkWallet = async () => {
    if (isLinkingWallet) {
      return;
    }

    setIsLinkingWallet(true);
    try {
      const account = await connectWallet({
        requestIfMissing: true,
        autoSwitch: false,
        forcePrompt: true,
      });

      if (!account) {
        throw new Error("No wallet connected.");
      }

      await linkWallet(account);
      setFormData((current) => ({
        ...current,
        linkedWallet: account.toLowerCase(),
      }));
      toast.success("Wallet linked to your profile.");
    } catch (error) {
      toast.error(error?.message || "Wallet link failed.");
    } finally {
      setIsLinkingWallet(false);
    }
  };

  const handleComplete = async (event) => {
    event.preventDefault();

    if (!session?.accessToken || !user?.id) {
      toast.error("Session expired. Please sign in again.");
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await completeProfileSetup(session.accessToken, user.id, {
        display_name: sanitizeText(formData.displayName || "", { maxLength: 80 }),
        organization_name: sanitizeText(formData.organizationName || "", { maxLength: 120 }),
        organization_role: sanitizeText(formData.organizationRole || "", { maxLength: 80 }),
        profile_photo_url: sanitizeText(formData.profilePhotoUrl || "", { maxLength: 300 }),
        wallet_address: formData.linkedWallet || wallet.account || profile?.wallet_address || "",
        bio: sanitizeText(formData.bio || "", { maxLength: 500 }),
      });

      await logAuditEvent(session.accessToken, user.id, {
        action: "profile_setup_completed",
        resource_type: "profile",
        resource_id: user.id,
        status: "success",
      }).catch(() => null);

      toast.success("Identity setup complete.");
      navigate("/dashboard", { replace: true });
    } catch (error) {
      toast.error(error?.message || "Failed to complete setup.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400/20 to-cyan-400/20 backdrop-blur-md">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-xl font-bold text-transparent">
              T
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-100">Welcome to TrustDoc</h1>
          <p className="mt-2 text-gray-400">Set up your identity to unlock your secure workspace.</p>
        </div>

        <Card className="mb-8">
          <StepIndicator steps={SETUP_STEPS} currentStep={currentStep} />

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-100">
              {SETUP_STEPS.find((item) => item.id === currentStep)?.title}
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              {SETUP_STEPS.find((item) => item.id === currentStep)?.description}
            </p>
          </div>

          {currentStep === "identity" ? (
            <IdentityStep formData={formData} setFormData={setFormData} onNext={handleNext} />
          ) : (
            <OrganizationStep
              formData={formData}
              setFormData={setFormData}
              onPrevious={() => setCurrentStep("identity")}
              onComplete={handleComplete}
              onLinkWallet={handleLinkWallet}
              isLinkingWallet={isLinkingWallet}
              connectedWallet={wallet.account}
            />
          )}
        </Card>

        <p className="text-center text-xs text-gray-500">
          You can update this identity data anytime from Settings.
          {isSubmitting ? " Completing setup..." : ""}
        </p>
      </div>
    </div>
  );
}
