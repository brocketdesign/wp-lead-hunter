import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Zap, Search, Mail, Database, Shield, ArrowRight, Check } from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Smart Discovery',
    description: 'Automatically find WordPress blogs matching your criteria with advanced detection algorithms.',
  },
  {
    icon: Database,
    title: 'Lead Management',
    description: 'Organize, score, and track all your leads in one centralized dashboard.',
  },
  {
    icon: Mail,
    title: 'AI-Powered Outreach',
    description: 'Generate personalized emails using OpenAI GPT-4 for higher response rates.',
  },
  {
    icon: Shield,
    title: 'Notion Integration',
    description: 'Seamlessly sync leads and activity with your Notion workspace.',
  },
];

const benefits = [
  'Automated WordPress site detection',
  'Domain age verification',
  'Traffic estimation',
  'Lead scoring system',
  'Email template management',
  'Notion synchronization',
];

export default function LandingPage() {
  const navigate = useNavigate();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Debug Banner */}
      {process.env.NODE_ENV === 'development' && (
        <div className={`fixed top-0 left-0 right-0 z-[100] text-sm py-2 px-4 text-white ${clerkKey ? 'bg-green-600' : 'bg-red-600'}`}>
          Clerk Key: {clerkKey ? '✓ Loaded' : '✗ Missing'} {clerkKey && `(${clerkKey.substring(0, 20)}...)`}
        </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200" style={{ marginTop: process.env.NODE_ENV === 'development' ? '30px' : '0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold text-lg">WP Lead Hunter</span>
            </div>
            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="text-sm font-medium text-gray-600 hover:text-gray-900">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="btn btn-primary text-sm">
                    Get Started
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="btn btn-primary text-sm"
                >
                  Go to Dashboard
                </button>
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-50 rounded-full text-primary-700 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            <span>Supercharge your lead generation</span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Discover & Convert
            <br />
            <span className="text-primary-600">WordPress Leads</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            The all-in-one platform for finding qualified WordPress blogs, managing leads,
            and sending AI-powered personalized outreach emails.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <SignedOut>
              <SignUpButton mode="modal">
                <button className="btn btn-primary text-base px-8 py-3 flex items-center gap-2">
                  Start Free <ArrowRight className="w-4 h-4" />
                </button>
              </SignUpButton>
            </SignedOut>
            <SignedIn>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn btn-primary text-base px-8 py-3 flex items-center gap-2"
              >
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </button>
            </SignedIn>
            <a
              href="#features"
              className="btn btn-secondary text-base px-8 py-3"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Everything you need for lead generation
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Powerful features to help you discover, qualify, and convert WordPress blog owners.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div key={feature.title} className="card hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                Built for efficiency
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Stop wasting time on manual research. Our platform automates the entire
                lead discovery and qualification process.
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl p-8 text-white">
              <h3 className="text-2xl font-bold mb-4">Ready to get started?</h3>
              <p className="text-primary-100 mb-6">
                Join thousands of marketers using WP Lead Hunter to grow their business.
              </p>
              <SignedOut>
                <SignUpButton mode="modal">
                  <button className="w-full bg-white text-primary-700 font-semibold py-3 rounded-lg hover:bg-primary-50 transition-colors">
                    Create Free Account
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full bg-white text-primary-700 font-semibold py-3 rounded-lg hover:bg-primary-50 transition-colors"
                >
                  Go to Dashboard
                </button>
              </SignedIn>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-600 rounded-md flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">WP Lead Hunter</span>
          </div>
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} WP Lead Hunter. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
