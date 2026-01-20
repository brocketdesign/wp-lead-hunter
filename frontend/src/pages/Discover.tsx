import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Bot,
  Play,
  RotateCcw,
  Trash2,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Sparkles,
  Target,
  Globe,
  Users,
  FileText,
  Zap,
  Download,
  FileJson,
  ChevronDown,
  ExternalLink,
  List,
  UserPlus,
  Check,
} from 'lucide-react';
import { useApi, UserSettings } from '../lib/api';
import { cn } from '../lib/utils';
import { ToastProvider, useToast } from '../components/Toast';
import { useAuth } from '@clerk/clerk-react';

interface BlogClassification {
  isPersonalBlog: boolean;
  isCorporateSite: boolean;
  blogType: 'personal' | 'indie' | 'corporate' | 'unknown';
  confidence: number;
  reasoning: string;
  niche?: string;
  estimatedAudience?: string;
  isGoodCollaborationTarget: boolean;
  collaborationPotentialReason: string;
}

interface DiscoveredLead {
  url: string;
  title?: string;
  description?: string;
  email?: string;
  isWordPress: boolean;
  domainAge?: number;
  traffic?: number;
  score: number;
  blogType?: 'personal' | 'indie' | 'corporate' | 'unknown';
  blogClassification?: BlogClassification;
  isActiveBlog?: boolean;
  isGoodTarget?: boolean;
  matchedKeyword?: string;
}

interface DiscoverySession {
  sessionId: string;
  source: string;
  leadCount: number;
  unsavedCount: number;
  createdAt: string;
}

interface LogEntry {
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error' | 'progress';
  message: string;
  details?: Record<string, unknown>;
}

interface GeneratedConfig {
  prompt: string;
  name: string;
  description: string;
}

interface AIObjectiveResponse {
  analysis: string;
  suggestedKeywords: string[];
  niche: string;
  language: string;
  targetAudience: string;
  additionalRequirements: string;
  agentName: string;
  agentDescription: string;
}

function DiscoverContent() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { getToken } = useAuth();

  // Form state
  const [niche, setNiche] = useState('');
  const [language, setLanguage] = useState('ja');
  const [targetAudience, setTargetAudience] = useState('Personal bloggers and small teams');
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [avoidScrapingSameUrl, setAvoidScrapingSameUrl] = useState(false);
  const [savedResultIndices, setSavedResultIndices] = useState<Record<string, Set<number>>>({});

  // AI-Assisted Creation state
  const [aiObjective, setAiObjective] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<AIObjectiveResponse | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());

  // Fetch user settings to check for keys
  const {
    data: settingsData,
    isLoading: isLoadingSettings,
  } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserSettings>('/user/settings'),
    staleTime: 1000 * 60 * 5,
  });

  // Agents list
  const { data: agentsData, isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get<any[]>('/agents'),
    refetchInterval: 5000,
  });

  // AI-assisted: Generate suggestions from objective
  const generateFromObjectiveMutation = useMutation({
    mutationFn: (payload: { objective: string }) =>
      api.post<AIObjectiveResponse>('/agents/generate-from-objective', payload),
    onSuccess: (res) => {
      const suggestions = res.data;
      setAiSuggestions(suggestions);
      // Auto-select all suggested keywords
      setSelectedKeywords(new Set(suggestions.suggestedKeywords || []));
      // Pre-fill the form with suggestions
      setNiche(suggestions.niche || '');
      setLanguage(suggestions.language || 'en');
      setTargetAudience(suggestions.targetAudience || 'Personal bloggers and small teams');
      setAdditionalRequirements(suggestions.additionalRequirements || '');
      addToast({
        type: 'success',
        title: 'AI Analysis Complete',
        message: 'Review the suggestions below and create your agent when ready.',
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Analysis Failed',
        message: error?.response?.data?.error || 'Failed to analyze your objective.',
      });
    },
  });

  // Generate prompt, name, and description using OpenAI
  const generateConfigMutation = useMutation({
    mutationFn: (payload: { niche: string; language?: string; platform?: string; targetAudience?: string; additionalRequirements?: string }) =>
      api.post('/agents/generate-prompt', payload),
    onSuccess: (res) => {
      const config = res.data;
      setGeneratedConfig(config);
      addToast({
        type: 'success',
        title: 'Configuration Generated',
        message: 'Agent name, description, and search prompt have been created successfully.',
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Generation Failed',
        message: error?.response?.data?.error || 'Failed to generate agent configuration.',
      });
    },
  });

  // Create agent
  const createAgentMutation = useMutation({
    mutationFn: (payload: { name: string; description: string; firecrawlPrompt: string; startImmediately?: boolean; avoidScrapingSameUrl?: boolean }) =>
      api.post('/agents', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setGeneratedConfig(null);
      setNiche('');
      setAdditionalRequirements('');
      addToast({
        type: 'success',
        title: 'Agent Created',
        message: 'Your discovery agent has been created and started successfully.',
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: error?.response?.data?.error || 'Failed to create agent.',
      });
    },
  });

  // Rerun agent
  const rerunAgentMutation = useMutation({
    mutationFn: (id: string) => api.post(`/agents/${id}/rerun`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      addToast({
        type: 'success',
        title: 'Agent Restarted',
        message: 'The agent has been restarted and will begin discovery again.',
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Restart Failed',
        message: error?.response?.data?.error || 'Failed to restart agent.',
      });
    },
  });

  // Delete agent
  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (selectedAgent) setSelectedAgent(null);
      addToast({
        type: 'success',
        title: 'Agent Deleted',
        message: 'The agent has been permanently deleted.',
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Deletion Failed',
        message: error?.response?.data?.error || 'Failed to delete agent.',
      });
    },
  });

  // Save result as lead
  const saveAsLeadMutation = useMutation({
    mutationFn: ({ agentId, resultIndices }: { agentId: string; resultIndices: number[] }) =>
      api.post('/agents/save-as-leads', { agentId, resultIndices }),
    onSuccess: (res, { agentId, resultIndices }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      // Track saved indices
      setSavedResultIndices(prev => ({
        ...prev,
        [agentId]: new Set([...(prev[agentId] || []), ...resultIndices]),
      }));
      const data = res.data as { savedCount: number };
      addToast({
        type: 'success',
        title: 'Saved to Leads',
        message: `${data.savedCount} result(s) saved to your leads.`,
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: error?.response?.data?.error || 'Failed to save results as leads.',
      });
    },
  });

  // Save all results as leads
  const saveAllAsLeadsMutation = useMutation({
    mutationFn: (agentId: string) =>
      api.post('/agents/save-as-leads', { agentId }),
    onSuccess: (res, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      const agent = agents.find((a: any) => a._id === agentId);
      const allIndices = (agent?.results || []).map((_: any, idx: number) => idx);
      setSavedResultIndices(prev => ({
        ...prev,
        [agentId]: new Set(allIndices),
      }));
      const data = res.data as { savedCount: number };
      addToast({
        type: 'success',
        title: 'All Results Saved',
        message: `${data.savedCount} result(s) saved to your leads.`,
      });
    },
    onError: (error: any) => {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: error?.response?.data?.error || 'Failed to save results as leads.',
      });
    },
  });

  const agents = agentsData?.data || [];
  const currentAgent = agents.find((a: any) => a._id === selectedAgent) || null;

  // Handle export downloads
  const handleExport = async (agentId: string, format: 'json' | 'csv') => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/agents/${agentId}/export/${format}`, {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-${agentId}-results.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addToast({
        type: 'success',
        title: 'Export Successful',
        message: `Results exported as ${format.toUpperCase()}`,
      });
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Export Failed',
        message: error?.message || 'Failed to export results',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'pending':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Toggle keyword selection
  const toggleKeyword = (keyword: string) => {
    const newSelected = new Set(selectedKeywords);
    if (newSelected.has(keyword)) {
      newSelected.delete(keyword);
    } else {
      newSelected.add(keyword);
    }
    setSelectedKeywords(newSelected);
    // Update niche with selected keywords
    setNiche(Array.from(newSelected).join(', '));
  };

  // Apply AI suggestions to the form
  const applyAiSuggestions = () => {
    if (aiSuggestions) {
      setNiche(Array.from(selectedKeywords).join(', ') || aiSuggestions.niche);
      setLanguage(aiSuggestions.language || 'en');
      setTargetAudience(aiSuggestions.targetAudience || 'Personal bloggers and small teams');
      setAdditionalRequirements(aiSuggestions.additionalRequirements || '');
    }
  };

  // Clear AI suggestions
  const clearAiSuggestions = () => {
    setAiSuggestions(null);
    setAiObjective('');
    setSelectedKeywords(new Set());
  };

  // Check API key availability
  const hasOpenAIApiKey = settingsData?.data?.hasOpenaiKey || false;
  const hasFirecrawlApiKey = settingsData?.data?.hasFirecrawlKey || false;
  const hasAllRequiredKeys = hasOpenAIApiKey && hasFirecrawlApiKey;
  const hasRequiredSettings = hasOpenAIApiKey || hasFirecrawlApiKey;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Search className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">AI-Powered Discovery</h1>
              <p className="text-gray-600 mt-1">
                Create intelligent agents to find WordPress blogs in your target niche
              </p>
            </div>
          </div>
        </div>

        {/* AI-Assisted Agent Creation */}
        <div className="mb-8">
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl shadow-sm border border-purple-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">AI-Assisted Agent Creation</h2>
                <p className="text-sm text-gray-600">Describe what you're looking for and let AI configure the agent for you</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What are you looking for?
                </label>
                <textarea
                  value={aiObjective}
                  onChange={(e) => setAiObjective(e.target.value)}
                  placeholder="e.g., I want to find Japanese anime bloggers who write reviews about new anime series. They should have a contact email and be open to collaborations. I'm looking for personal bloggers, not corporate sites."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors resize-none"
                  disabled={!hasOpenAIApiKey}
                />
              </div>

              <button
                onClick={() => generateFromObjectiveMutation.mutate({ objective: aiObjective })}
                disabled={generateFromObjectiveMutation.isPending || !aiObjective.trim() || !hasOpenAIApiKey}
                className={cn(
                  'w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-medium transition-all duration-200',
                  generateFromObjectiveMutation.isPending || !aiObjective.trim() || !hasOpenAIApiKey
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                )}
              >
                {generateFromObjectiveMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing your objective...
                  </>
                ) : !hasOpenAIApiKey ? (
                  <>
                    <AlertCircle className="w-5 h-5" />
                    OpenAI API Key Required
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Let AI Configure My Agent
                  </>
                )}
              </button>

              {/* AI Suggestions */}
              {aiSuggestions && (
                <div className="mt-6 p-4 bg-white rounded-lg border border-purple-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                      <Bot className="w-5 h-5 text-purple-600" />
                      AI Suggestions
                    </h3>
                    <button
                      onClick={clearAiSuggestions}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>

                  {aiSuggestions.analysis && (
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-sm text-gray-700">{aiSuggestions.analysis}</p>
                    </div>
                  )}

                  {/* Keywords Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Suggested Keywords (click to toggle)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {aiSuggestions.suggestedKeywords.map((keyword) => (
                        <button
                          key={keyword}
                          onClick={() => toggleKeyword(keyword)}
                          className={cn(
                            'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                            selectedKeywords.has(keyword)
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          )}
                        >
                          {selectedKeywords.has(keyword) ? (
                            <Check className="w-3 h-3 inline mr-1" />
                          ) : null}
                          {keyword}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Suggested Agent Info */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Agent Name:</span>
                      <p className="text-gray-900">{aiSuggestions.agentName}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Language:</span>
                      <p className="text-gray-900">{aiSuggestions.language === 'ja' ? 'Japanese' : aiSuggestions.language === 'en' ? 'English' : aiSuggestions.language}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium text-gray-700">Target Audience:</span>
                      <p className="text-gray-900">{aiSuggestions.targetAudience}</p>
                    </div>
                    {aiSuggestions.additionalRequirements && (
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">Additional Requirements:</span>
                        <p className="text-gray-900">{aiSuggestions.additionalRequirements}</p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500">
                    The form below has been pre-filled with these suggestions. Review and modify as needed, then generate your agent.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Create Agent Form */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Create Discovery Agent</h2>
              </div>

              {/* API Keys Warning */}
              {!isLoadingSettings && (!hasOpenAIApiKey || !hasFirecrawlApiKey) && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-medium text-yellow-800">API Keys Required</h3>
                      <div className="text-sm text-yellow-700 mt-1 space-y-1">
                        {!hasOpenAIApiKey && (
                          <p>• <strong>OpenAI API Key:</strong> Required for generating agent prompts and configurations</p>
                        )}
                        {!hasFirecrawlApiKey && (
                          <p>• <strong>Firecrawl API Key:</strong> Required for creating and running discovery agents</p>
                        )}
                        <p className="mt-2">Please configure the missing keys in Settings to use this feature.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {/* Niche Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Target className="w-4 h-4 inline mr-2" />
                    Target Niche / Topic
                  </label>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="e.g. アニメブログ, tech reviews, cooking recipes"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
                    disabled={!hasOpenAIApiKey}
                  />
                </div>

                {/* Language Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Globe className="w-4 h-4 inline mr-2" />
                    Content Language
                  </label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all appearance-none cursor-pointer hover:border-gray-400"
                      disabled={!hasOpenAIApiKey}
                    >
                      <option value="ja">Japanese (日本語)</option>
                      <option value="en">English</option>
                      <option value="es">Spanish (Español)</option>
                      <option value="fr">French (Français)</option>
                      <option value="de">German (Deutsch)</option>
                      <option value="other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Target Audience */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Users className="w-4 h-4 inline mr-2" />
                    Target Audience
                  </label>
                  <div className="relative">
                    <select
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value)}
                      className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all appearance-none cursor-pointer hover:border-gray-400"
                      disabled={!hasOpenAIApiKey}
                    >
                      <option value="Personal bloggers and small teams">Personal bloggers & small teams</option>
                      <option value="Individual creators">Individual creators</option>
                      <option value="Small businesses">Small businesses</option>
                      <option value="Professional bloggers">Professional bloggers</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* Additional Requirements */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <FileText className="w-4 h-4 inline mr-2" />
                    Additional Requirements (Optional)
                  </label>
                  <textarea
                    value={additionalRequirements}
                    onChange={(e) => setAdditionalRequirements(e.target.value)}
                    placeholder="e.g. Prefer sites with profile pages, monthly traffic > 10k, specific keywords..."
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors resize-none"
                    disabled={!hasOpenAIApiKey}
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={() => generateConfigMutation.mutate({
                    niche,
                    language,
                    platform: 'WordPress',
                    targetAudience,
                    additionalRequirements
                  })}
                  disabled={generateConfigMutation.isLoading || !niche || !hasOpenAIApiKey}
                  className={cn(
                    'w-full flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-medium transition-all duration-200',
                    generateConfigMutation.isLoading || !niche || !hasOpenAIApiKey
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  )}
                >
                  {generateConfigMutation.isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Configuration...
                    </>
                  ) : !hasOpenAIApiKey ? (
                    <>
                      <AlertCircle className="w-5 h-5" />
                      OpenAI API Key Required
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Generate Agent Configuration
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Generated Configuration */}
            {generatedConfig && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Generated Configuration</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Agent Name</label>
                    <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                      {generatedConfig.name}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                      {generatedConfig.description}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Search Prompt</label>
                    <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 whitespace-pre-wrap text-sm max-h-40 overflow-y-auto">
                      {generatedConfig.prompt}
                    </div>
                  </div>

                  {/* JSON Result Format Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <FileJson className="w-4 h-4 inline mr-2" />
                      JSON Result Format Preview
                    </label>
                    <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 text-xs font-mono overflow-x-auto">
                      <pre className="whitespace-pre-wrap">
{JSON.stringify([
  {
    blog_name: "Example Blog Name",
    url: "https://example.com",
    contact_email: "contact@example.com",
    contact_form_link: "https://example.com/contact",
    platform: "WordPress",
    topics: "Technology, AI",
    monthly_unique_users_approx: "10,000",
    has_profile_page: true
  }
], null, 2)}
                      </pre>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      This is the expected format of the results. Each agent will return an array of objects with these fields.
                    </p>
                  </div>

                  {/* Avoid scraping same URL checkbox */}
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <input
                      type="checkbox"
                      id="avoidScrapingSameUrl"
                      checked={avoidScrapingSameUrl}
                      onChange={(e) => setAvoidScrapingSameUrl(e.target.checked)}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label htmlFor="avoidScrapingSameUrl" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Avoid scraping the same URL
                    </label>
                  </div>

                  <button
                    onClick={() => createAgentMutation.mutate({
                      name: generatedConfig.name,
                      description: generatedConfig.description,
                      firecrawlPrompt: generatedConfig.prompt,
                      startImmediately: true,
                      avoidScrapingSameUrl: avoidScrapingSameUrl
                    })}
                    disabled={createAgentMutation.isLoading || !hasFirecrawlApiKey}
                    className={cn(
                      'w-full flex items-center justify-center gap-3 px-6 py-4 rounded-lg font-medium transition-all duration-200',
                      createAgentMutation.isLoading || !hasFirecrawlApiKey
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                    )}
                  >
                    {createAgentMutation.isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating Agent...
                      </>
                    ) : !hasFirecrawlApiKey ? (
                      <>
                        <AlertCircle className="w-5 h-5" />
                        Firecrawl API Key Required
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5" />
                        Create & Start Agent
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Agents List & Results */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-purple-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900">Your Discovery Agents</h2>
                </div>
                <a
                  href="/api/agents/scraped-urls"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <List className="w-4 h-4" />
                  View All Scraped URLs
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {isLoadingAgents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : agents.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No agents yet</h3>
                  <p className="text-gray-600">Create your first discovery agent to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {agents.map((agent: any) => (
                    <div key={agent._id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-900 truncate">{agent.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">{agent.description}</p>
                        </div>
                        <div className={cn('flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium', getStatusColor(agent.status))}>
                          {getStatusIcon(agent.status)}
                          <span className="capitalize">{agent.status}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
                        <span>{(agent.results || []).length} results found</span>
                        {agent.completedAt && (
                          <span>Completed {new Date(agent.completedAt).toLocaleDateString()}</span>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAgent(agent._id === selectedAgent ? null : agent._id)}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                          {selectedAgent === agent._id ? 'Hide' : 'View'} Results
                        </button>
                        <button
                          onClick={() => rerunAgentMutation.mutate(agent._id)}
                          disabled={rerunAgentMutation.isLoading || agent.status === 'running'}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded-lg hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Restart
                        </button>
                        <button
                          onClick={() => deleteAgentMutation.mutate(agent._id)}
                          disabled={deleteAgentMutation.isLoading}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent Results */}
            {currentAgent && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Zap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">{currentAgent.name}</h3>
                      <p className="text-gray-600">Discovery Results</p>
                    </div>
                  </div>
                  {(currentAgent.results || []).length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExport(currentAgent._id, 'json')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <FileJson className="w-4 h-4" />
                        Export JSON
                      </button>
                      <button
                        onClick={() => handleExport(currentAgent._id, 'csv')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </div>
                  )}
                </div>

                {(currentAgent.results || []).length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-900 mb-2">No results yet</h4>
                    <p className="text-gray-600">
                      {currentAgent.status === 'running'
                        ? 'The agent is currently searching for blogs...'
                        : 'The agent hasn\'t found any results yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Save All Button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveAllAsLeadsMutation.mutate(currentAgent._id)}
                        disabled={saveAllAsLeadsMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saveAllAsLeadsMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <UserPlus className="w-4 h-4" />
                        )}
                        Save All to Leads
                      </button>
                    </div>

                    {(currentAgent.results || []).map((result: any, idx: number) => {
                      const isSaved = savedResultIndices[currentAgent._id]?.has(idx);
                      return (
                        <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-900 truncate">{result.blog_name || 'Unknown Blog'}</h4>
                              <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 truncate block"
                              >
                                {result.url}
                              </a>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                WordPress
                              </span>
                              {/* Save to Lead Button */}
                              <button
                                onClick={() => saveAsLeadMutation.mutate({ 
                                  agentId: currentAgent._id, 
                                  resultIndices: [idx] 
                                })}
                                disabled={saveAsLeadMutation.isPending || isSaved}
                                className={cn(
                                  'flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg transition-colors',
                                  isSaved
                                    ? 'bg-gray-100 text-gray-500 cursor-default'
                                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                                )}
                              >
                                {isSaved ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    Saved
                                  </>
                                ) : saveAsLeadMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <UserPlus className="w-3 h-3" />
                                    Save to Leads
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {result.topics && (
                            <p className="text-sm text-gray-600 mb-3">
                              <strong>Topics:</strong> {result.topics}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700">Email:</span>
                              <span className="ml-2 text-gray-900">
                                {result.contact_email || 'Not found'}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Contact Form:</span>
                              <span className="ml-2 text-gray-900">
                                {result.contact_form_link ? (
                                  <a
                                    href={result.contact_form_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    Available
                                  </a>
                                ) : (
                                  'Not found'
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Discover() {
  return (
    <ToastProvider>
      <DiscoverContent />
    </ToastProvider>
  );
}
