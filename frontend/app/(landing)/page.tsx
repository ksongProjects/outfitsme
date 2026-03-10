"use client"

import AppFooter from "@/components/AppFooter"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useState } from "react"
import { Sparkles, Shirt, User } from "lucide-react"

function Home() {
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleGoogleSignIn = async (acceptedTerms: boolean, termsVersion: string) => {
    setIsSigningIn(true)
    console.log("Google sign in with terms:", acceptedTerms, termsVersion)
    // TODO: Implement actual Google sign-in
    setTimeout(() => setIsSigningIn(false), 2000)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await handleGoogleSignIn(true, "2026-03-05")
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-semibold">OutfitsMe</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-primary/5 via-transparent to-transparent" />
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-150 h-150 bg-primary/10 rounded-full blur-3xl" />
          
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                  <Sparkles className="w-4 h-4" />
                  <span>AI-Powered Outfit Analysis</span>
                </div>
                
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                  Find your style from photos
                </h1>
                
                <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                  Upload outfit images, identify clothing items with AI, and preview looks on your own profile photo. Your personal stylist in your pocket.
                </p>

                <div className="flex flex-col sm:flex-row gap-4">
                  <form onSubmit={handleSubmit} className="flex-1 max-w-sm">
                    <Button 
                      type="submit" 
                      size="lg"
                      disabled={isSigningIn}
                      className="w-full"
                    >
                      {isSigningIn ? "Signing in..." : "Get Started"}
                    </Button>
                  </form>
                  <Button variant="outline" size="lg">
                    <a href="#features">Learn More</a>
                  </Button>
                </div>
              </div>

              <div className="relative">
                <div className="relative z-10 bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
                  <div className="aspect-4/5 bg-linear-to-br from-primary/10 via-secondary/20 to-primary/10 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary/20 flex items-center justify-center">
                        <User className="w-10 h-10 text-primary" />
                      </div>
                      <p className="text-muted-foreground">Your virtual try-on preview</p>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-4 -left-4 w-48 h-48 bg-primary/10 rounded-full blur-2xl" />
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 lg:py-32 bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Everything you need to discover your style
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Powerful AI tools to analyze, try on, and organize your wardrobe.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Analyze Outfits</h3>
                <p className="text-muted-foreground">
                  Upload a photo and select an area to identify style and clothing items using AI.
                </p>
              </div>

              <div className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Virtual Try-On</h3>
                <p className="text-muted-foreground">
                  See personalized try-on previews from your analyzed and custom outfits on your profile.
                </p>
              </div>

              <div className="bg-card rounded-2xl p-6 border border-border shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Shirt className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">Build Wardrobe</h3>
                <p className="text-muted-foreground">
                  Save, organize, and reuse looks in your digital wardrobe. Never forget a great outfit.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 lg:py-32">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Ready to discover your style?
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Join thousands of users who have transformed their wardrobe with AI-powered outfit analysis.
            </p>
            <form onSubmit={handleSubmit} className="inline-flex gap-4 flex-col sm:flex-row">
              <Button type="submit" size="lg" disabled={isSigningIn}>
                {isSigningIn ? "Signing in..." : "Get Started Free"}
              </Button>
            </form>
          </div>
        </section>
      </main>

      <AppFooter />
    </div>
  )
}

export default Home
