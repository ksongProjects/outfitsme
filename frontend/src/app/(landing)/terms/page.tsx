import LegalPage from "@/components/app/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage
      label="Terms"
      title="OutfitsMe Terms of Service"
      lastUpdated="March 5, 2026"
      summary="These terms explain the current trial experience, the kinds of content you can upload, and the limits around service availability while the product evolves."
      highlights={[
        "OutfitsMe offers a managed trial experience for outfit analysis, wardrobe tools, and generated previews.",
        "Usage limits and feature availability can change as we manage abuse prevention and operating costs.",
        "You keep ownership of your content, while granting permission for processing needed to provide the service.",
      ]}
      sections={[
        {
          title: "Service requirements",
          content: (
            <>
              <p>
                OutfitsMe provides a managed experience for outfit analysis,
                wardrobe organization, and image-based previews. Trial access,
                daily limits, and feature availability may change over time.
              </p>
            </>
          ),
        },
        {
          title: "Trial usage and billing",
          content: (
            <>
              <p>
                During the current trial period, OutfitsMe covers external AI
                usage behind the service. We may limit, throttle, or suspend
                AI-powered features to prevent abuse or manage operational
                costs.
              </p>
            </>
          ),
        },
        {
          title: "User content",
          content: (
            <>
              <p>
                You retain ownership of images and content you upload. By using
                the service, you grant us permission to process that content to
                provide analysis, outfit previews, wardrobe organization, and
                related features.
              </p>
            </>
          ),
        },
        {
          title: "Acceptable use",
          content: (
            <>
              <p>
                You agree not to use OutfitsMe for unlawful, abusive, or
                harmful content or activity. We may suspend access for misuse
                or attempts to bypass usage controls.
              </p>
            </>
          ),
        },
        {
          title: "Availability and changes",
          content: (
            <>
              <p>
                We may modify, pause, or discontinue features at any time.
                Service availability is not guaranteed, and retailer-search
                features may remain incomplete until third-party integrations
                are finalized.
              </p>
            </>
          ),
        },
        {
          title: "Disclaimer and liability",
          content: (
            <>
              <p>
                OutfitsMe is provided &quot;as is&quot; without warranties. To the
                maximum extent permitted by law, we are not liable for indirect,
                incidental, or consequential damages resulting from use of the
                service.
              </p>
            </>
          ),
        },
      ]}
      companionHref="/privacy"
      companionLabel="View Privacy Policy"
    />
  );
}
