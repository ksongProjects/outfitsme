import "../styles/globals.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <Head>
        <title>OutfitsMe</title>
        <meta name="description" content="OutfitsMe - Create Your Own Outfit" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Toaster richColors position="top-center" />
      <Component {...pageProps} />
    </QueryClientProvider>
  );
}
