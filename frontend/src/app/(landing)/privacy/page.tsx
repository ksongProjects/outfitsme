import LegalPage from "@/components/app/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Privacy"
      title="OutfitsMe Privacy Policy"
      lastUpdated="March 5, 2026"
      summary="We only process the account, wardrobe, and image data needed to run the product, generate previews, and keep your saved experience working."
      highlights={[
        "We process account details, uploaded images, saved wardrobe data, and generated outputs.",
        "Your information is used to operate the app, improve reliability, and power AI-assisted features.",
        "Some providers help deliver storage, authentication, and AI functionality under their own policies.",
      ]}
      sections={[
        {
          title: "Data we process",
          content: (
            <>
              <p>
                We process account information, uploaded images, feature
                preferences, and generated outputs to operate the outfit
                analysis, wardrobe, and preview features inside OutfitsMe.
              </p>
            </>
          ),
        },
        {
          title: "How we use data",
          content: (
            <>
              <p>
                Your data is used to run the app, maintain your saved wardrobe,
                improve reliability, and support AI-powered features such as
                image analysis and personalized outfit previews.
              </p>
            </>
          ),
        },
        {
          title: "Third-party services",
          content: (
            <>
              <p>
                OutfitsMe integrates with Google Gemini, Better Auth,
                PostgreSQL, and Supabase-backed storage services. Those
                providers may process limited data according to their own terms
                and privacy policies.
              </p>
            </>
          ),
        },
        {
          title: "AI providers",
          content: (
            <>
              <p>
                The current experience uses a managed server-side AI
                integration. We do not require users to paste their own AI API
                keys into the frontend for the core product flow.
              </p>
            </>
          ),
        },
        {
          title: "Security",
          content: (
            <>
              <p>
                We use reasonable safeguards, but no system is completely
                secure. You remain responsible for protecting your account
                credentials and Google sign-in access.
              </p>
            </>
          ),
        },
        {
          title: "Contact",
          content: (
            <>
              <p>
                If you have privacy questions, contact the OutfitsMe team
                through the project support channel.
              </p>
            </>
          ),
        },
      ]}
      companionHref="/terms"
      companionLabel="View Terms of Service"
    />
  );
}
