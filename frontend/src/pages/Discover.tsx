import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi, UserSettings } from '../lib/api';
import { useAuth } from '@clerk/clerk-react';
import {
  Search,
  Globe,
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle,
  Plus,
  Save,
  User,
  Building2,
  Users,
  Filter,
  History,
  Target,
  Mail,
  Eye,
  X,
  ExternalLink,
  Zap,
  Activity,
  Terminal,
  ChevronDown,
  ChevronUp,
  Tag,
  Settings,
} from 'lucide-react';

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

export default function Discover() {
  const api = useApi();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  
  const [keywords, setKeywords] = useState('');
  const [minTraffic, setMinTraffic] = useState(500);
  const [filterCorporate, setFilterCorporate] = useState(true);
  const [language, setLanguage] = useState('');
  const [excludeWordPressCom, setExcludeWordPressCom] = useState(true);
  const [autoSearchExpanded, setAutoSearchExpanded] = useState(true);
  const [maxResults, setMaxResults] = useState(50);
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [discoverySessionId, setDiscoverySessionId] = useState<string | null>(null);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [expandedKeywords, setExpandedKeywords] = useState<string[]>([]);
  const [searchedKeywords, setSearchedKeywords] = useState<string[]>([]);
  const [filteredOutCount, setFilteredOutCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DiscoveredLead | null>(null);
  const [isViewingFromHistory, setIsViewingFromHistory] = useState(false);
  
  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch discovery history
  const { data: sessionsData } = useQuery({
    queryKey: ['discovery-sessions'],
    queryFn: () => api.get<DiscoverySession[]>('/leads/my/sessions'),
  });

  // Fetch user settings to check for API key
  const {
    data: settingsData,
    isLoading: isLoadingSettings,
    isError: isSettingsError,
    error: settingsError,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserSettings>('/user/settings'),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    retry: 1,
  });

  const hasOpenaiKey = settingsData?.data?.hasOpenaiKey ?? false;
  const isSettingsReady = !isLoadingSettings && !isSettingsError && settingsData !== undefined;

  // Fetch unsaved leads from a session
  const loadSessionLeadsMutation = useMutation({
    mutationFn: (sessionId: string) => 
      api.get<DiscoveredLead[]>(`/leads/my/sessions/${sessionId}/unsaved`),
    onSuccess: (response) => {
      if (response.data) {
        setDiscoveredLeads(response.data);
        setSelectedLeads(new Set());
        setSuggestedKeywords([]);
        setExpandedKeywords([]);
        setSearchedKeywords([]);
        setFilteredOutCount(0);
        setIsViewingFromHistory(true);
        setLogs([]);
      }
    },
  });

  const saveLeadsMutation = useMutation({
    mutationFn: (data: { leads: DiscoveredLead[]; source: string; discoverySessionId?: string }) =>
      api.post<{ savedCount: number }>('/leads/discover/save', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['discovery-sessions'] });
      setDiscoveredLeads((prev) =>
        prev.filter((lead) => !selectedLeads.has(lead.url))
      );
      setSelectedLeads(new Set());
    },
  });

  // Start streaming discovery
  const startStreamingDiscovery = useCallback(async () => {
    if (!keywords.trim()) return;
    
    // Wait for settings to load before checking API key
    if (isLoadingSettings) {
      setLogs([{
        timestamp: Date.now(),
        type: 'warning',
        message: 'Loading settings, please wait...'
      }]);
      setShowLogs(true);
      return;
    }

    // If settings failed to load, try to refetch once and report error if it still fails
    if (isSettingsError) {
      setLogs([{
        timestamp: Date.now(),
        type: 'warning',
        message: 'Failed to load settings, retrying...'
      }]);
      setShowLogs(true);

      try {
        const refetchResult = await refetchSettings();
        if (!refetchResult.data) {
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            type: 'error',
            message: 'Unable to load settings. Please refresh the page or check your network/authorization.'
          }]);
          setIsStreaming(false);
          return;
        }
      } catch (refetchError) {
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          type: 'error',
          message: 'Failed to fetch settings. Please refresh the page or sign in again.'
        }]);
        setIsStreaming(false);
        return;
      }
    }

    // Check for API key before starting (only if settings are loaded)
    if (!hasOpenaiKey) {
      setLogs([{
        timestamp: Date.now(),
        type: 'error',
        message: 'OpenAI API key not configured. Please go to Settings and add your API key before running discovery.',
      }]);
      setShowLogs(true);
      return;
    }
    
    const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    
    // Reset state
    setDiscoveredLeads([]);
    setSelectedLeads(new Set());
    setSuggestedKeywords([]);
    setExpandedKeywords([]);
    setSearchedKeywords([]);
    setFilteredOutCount(0);
    setIsViewingFromHistory(false);
    setLogs([]);
    setIsStreaming(true);
    setShowLogs(true);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const token = await getToken();
      
      const response = await fetch('/api/leads/discover/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          keywords: keywordList,
          minTraffic,
          maxResults,
          expandKeywords: true,
          autoSearchExpanded,
          maxPagesPerSearch: 2,
          filterCorporate,
          language: language || undefined,
          excludeWordPressCom,
          chunkSize: 10,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start discovery');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        let currentEvent = '';
        let currentData = '';
        
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
            
            try {
              const data = JSON.parse(currentData);
              
              switch (currentEvent) {
                case 'log':
                  setLogs(prev => [...prev, data as LogEntry]);
                  break;
                  
                case 'leads':
                  setDiscoveredLeads(prev => [...prev, ...data.leads]);
                  setSearchedKeywords(data.searchedKeywords || []);
                  break;
                  
                case 'keywords':
                  setSuggestedKeywords(data.suggestedKeywords || []);
                  setExpandedKeywords(data.expandedKeywords || []);
                  break;
                  
                case 'complete':
                  setFilteredOutCount(data.filteredOut || 0);
                  setDiscoverySessionId(data.discoverySessionId);
                  setSearchedKeywords(data.searchedKeywords || []);
                  setIsStreaming(false);
                  break;
                  
                case 'error':
                  const errorMessage = data.code === 'MISSING_API_KEY' 
                    ? 'OpenAI API key not configured. Please go to Settings and add your API key.'
                    : (data.error || data.message || 'Discovery failed');
                  setLogs(prev => [...prev, {
                    timestamp: Date.now(),
                    type: 'error',
                    message: errorMessage,
                  }]);
                  setIsStreaming(false);
                  break;
              }
            } catch {
              // Ignore parse errors
            }
            
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          type: 'error',
          message: error instanceof Error ? error.message : 'Discovery failed',
        }]);
      }
      setIsStreaming(false);
    }
  }, [keywords, minTraffic, maxResults, autoSearchExpanded, filterCorporate, language, excludeWordPressCom, getToken, hasOpenaiKey, isSettingsReady]);

  const handleDiscover = (e: React.FormEvent) => {
    e.preventDefault();
    startStreamingDiscovery();
  };

  const stopDiscovery = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      type: 'warning',
      message: 'Discovery stopped by user',
    }]);
  };

  const toggleSelectLead = (url: string) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedLeads.size === discoveredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(discoveredLeads.map(l => l.url)));
    }
  };

  const handleSaveSelected = () => {
    const leadsToSave = discoveredLeads.filter((lead) => selectedLeads.has(lead.url));
    saveLeadsMutation.mutate({
      leads: leadsToSave,
      source: keywords,
      discoverySessionId: discoverySessionId || undefined,
    });
  };

  const handleSaveAll = () => {
    saveLeadsMutation.mutate({
      leads: discoveredLeads,
      source: keywords,
      discoverySessionId: discoverySessionId || undefined,
    });
  };

  const addSuggestedKeyword = (keyword: string) => {
    const currentKeywords = keywords.split(',').map(k => k.trim()).filter(Boolean);
    if (!currentKeywords.includes(keyword)) {
      setKeywords([...currentKeywords, keyword].join(', '));
    }
  };

  const getBlogTypeIcon = (blogType?: string) => {
    switch (blogType) {
      case 'personal':
        return <User className="w-4 h-4 text-blue-500" />;
      case 'indie':
        return <Users className="w-4 h-4 text-purple-500" />;
      case 'corporate':
        return <Building2 className="w-4 h-4 text-gray-500" />;
      default:
        return <Globe className="w-4 h-4 text-gray-400" />;
    }
  };

  const getBlogTypeBadge = (blogType?: string) => {
    switch (blogType) {
      case 'personal':
        return <span className="badge bg-blue-100 text-blue-800 text-xs">Personal</span>;
      case 'indie':
        return <span className="badge bg-purple-100 text-purple-800 text-xs">Indie</span>;
      case 'corporate':
        return <span className="badge bg-gray-100 text-gray-800 text-xs">Corporate</span>;
      default:
        return null;
    }
  };

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      case 'progress':
        return <Activity className="w-3 h-3 text-blue-500 animate-pulse" />;
      default:
        return <Terminal className="w-3 h-3 text-gray-400" />;
    }
  };

  const highlightKeyword = (text: string | undefined, keyword: string | undefined) => {
    if (!text || !keyword) return text;
    const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
      ) : part
    );
  };

  return (
    <div className="space-y-6">
      {/* API Key Warning Banner - only show when settings are loaded and key is missing */}
      {isSettingsReady && !hasOpenaiKey && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-medium text-yellow-800">OpenAI API Key Required</h3>
            <p className="text-sm text-yellow-700 mt-1">
              You need to configure your OpenAI API key before running lead discovery. 
              The discovery feature uses OpenAI's web search to find WordPress blogs.
            </p>
            <a 
              href="/settings" 
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900"
            >
              <Settings className="w-4 h-4" />
              Go to Settings
            </a>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discover Leads</h1>
          <p className="text-gray-600 mt-1">
            Find WordPress bloggers for collaboration opportunities. AI filters out corporate sites.
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`btn ${showHistory ? 'btn-primary' : 'btn-secondary'} flex items-center gap-2`}
        >
          <History className="w-4 h-4" />
          History
          {sessionsData?.data && sessionsData.data.length > 0 && (
            <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">
              {sessionsData.data.length}
            </span>
          )}
        </button>
      </div>

      {/* Discovery History */}
      {showHistory && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-3">Recent Discovery Sessions</h3>
          {loadSessionLeadsMutation.isPending && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
              <span className="ml-2 text-gray-600">Loading session leads...</span>
            </div>
          )}
          {sessionsData?.data && sessionsData.data.length > 0 ? (
            <div className="space-y-2">
              {sessionsData.data.slice(0, 10).map((session) => (
                <button
                  key={session.sessionId}
                  onClick={() => {
                    loadSessionLeadsMutation.mutate(session.sessionId);
                    setKeywords(session.source);
                    setDiscoverySessionId(session.sessionId);
                    setShowHistory(false);
                  }}
                  disabled={loadSessionLeadsMutation.isPending}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left disabled:opacity-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">{session.source}</p>
                    <p className="text-sm text-gray-500">
                      <span className="text-primary-600 font-medium">{session.unsavedCount} remaining</span>
                      {' '}of {session.leadCount} leads • {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Eye className="w-4 h-4 text-gray-400" />
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <History className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No unsaved discovery results.</p>
              <p className="text-sm">Run a discovery to find leads, then come back to see what you haven't saved yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Search Form */}
      <div className="card">
        <form onSubmit={handleDiscover} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Keywords
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., travel blog, food recipes, tech reviews"
                className="input pl-10"
                disabled={isStreaming}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter comma-separated keywords to find WordPress bloggers in your niche
            </p>
          </div>

          {/* Searched Keywords - Highlighted */}
          {searchedKeywords.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Searched Keywords
              </label>
              <div className="flex flex-wrap gap-2">
                {(expandedKeywords.length > 0 ? expandedKeywords : keywords.split(',').map(k => k.trim())).map((kw) => {
                  const wasSearched = searchedKeywords.includes(kw);
                  return (
                    <span
                      key={kw}
                      className={`px-3 py-1 text-sm rounded-full transition-all ${
                        wasSearched
                          ? 'bg-green-100 text-green-800 border border-green-300'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      {wasSearched && <CheckCircle className="w-3 h-3 inline mr-1" />}
                      {kw}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suggested Keywords */}
          {suggestedKeywords.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Suggested Keywords
              </label>
              <div className="flex flex-wrap gap-2">
                {suggestedKeywords.map((kw) => {
                  const isIncluded = expandedKeywords.includes(kw);
                  const wasSearched = searchedKeywords.includes(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => addSuggestedKeyword(kw)}
                      disabled={isStreaming}
                      className={`px-3 py-1 text-sm rounded-full transition-colors ${
                        wasSearched
                          ? 'bg-green-100 text-green-800 cursor-default'
                          : isIncluded
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {wasSearched ? '✓ ' : isIncluded ? '⚡ ' : '+ '}
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                Min Monthly Traffic
              </label>
              <input
                type="number"
                value={minTraffic}
                onChange={(e) => setMinTraffic(parseInt(e.target.value) || 0)}
                min={0}
                className="input"
                disabled={isStreaming}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Target className="w-4 h-4 inline mr-1" />
                Max Results
              </label>
              <input
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value) || 50)}
                min={10}
                max={200}
                className="input"
                disabled={isStreaming}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Globe className="w-4 h-4 inline mr-1" />
                Target Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="input"
                disabled={isStreaming}
              >
                <option value="">All Languages</option>
                <option value="en">English</option>
                <option value="de">German (Deutsch)</option>
                <option value="fr">French (Français)</option>
                <option value="es">Spanish (Español)</option>
                <option value="it">Italian (Italiano)</option>
                <option value="pt">Portuguese (Português)</option>
                <option value="nl">Dutch (Nederlands)</option>
                <option value="pl">Polish (Polski)</option>
                <option value="ru">Russian (Русский)</option>
                <option value="ja">Japanese (日本語)</option>
                <option value="ko">Korean (한국어)</option>
                <option value="zh">Chinese (中文)</option>
                <option value="ar">Arabic (العربية)</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="tr">Turkish (Türkçe)</option>
                <option value="sv">Swedish (Svenska)</option>
                <option value="da">Danish (Dansk)</option>
                <option value="no">Norwegian (Norsk)</option>
                <option value="fi">Finnish (Suomi)</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterCorporate}
                  onChange={(e) => setFilterCorporate(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  disabled={isStreaming}
                />
                <span className="text-sm font-medium text-gray-700">
                  <Filter className="w-4 h-4 inline mr-1" />
                  Filter Corporate Sites
                </span>
              </label>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeWordPressCom}
                  onChange={(e) => setExcludeWordPressCom(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  disabled={isStreaming}
                />
                <span className="text-sm font-medium text-gray-700">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Self-hosted Only
                </span>
              </label>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSearchExpanded}
                  onChange={(e) => setAutoSearchExpanded(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                  disabled={isStreaming}
                />
                <span className="text-sm font-medium text-gray-700">
                  <Zap className="w-4 h-4 inline mr-1" />
                  Auto-expand Keywords
                </span>
              </label>
              <span className="ml-1 text-xs text-gray-500" title="Automatically search with AI-suggested keywords">
                (AI)
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            {!isStreaming ? (
              <button
                type="submit"
                disabled={!keywords.trim()}
                className="btn btn-primary flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Discover Bloggers
              </button>
            ) : (
              <button
                type="button"
                onClick={stopDiscovery}
                className="btn bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Stop Discovery
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Live Log Display */}
      {(isStreaming || logs.length > 0) && (
        <div className="card p-0 overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-600" />
              <span className="font-semibold text-gray-900">Discovery Log</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-sm text-blue-600">
                  <Activity className="w-3 h-3 animate-pulse" />
                  Live
                </span>
              )}
              <span className="text-xs text-gray-500 ml-2">
                ({logs.length} entries)
              </span>
              {discoveredLeads.length > 0 && isStreaming && (
                <span className="flex items-center gap-1 text-sm text-green-600 ml-2">
                  <CheckCircle className="w-3 h-3" />
                  {discoveredLeads.length} leads found
                </span>
              )}
            </div>
            {showLogs ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          
          {showLogs && (
            <div className="bg-gray-900 text-gray-100 p-4 max-h-80 overflow-y-auto font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-500">Waiting for discovery to start...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="flex items-start gap-2 py-1 border-b border-gray-800 last:border-0">
                    <span className="text-gray-500 shrink-0 w-20">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="shrink-0">{getLogIcon(log.type)}</span>
                    <span className={
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'progress' ? 'text-blue-400' :
                      'text-gray-300'
                    }>
                      {log.message}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <span className="text-gray-500 ml-2">
                          {typeof log.details.elapsed === 'number' && (
                            <span className="text-cyan-400">[{(log.details.elapsed as number / 1000).toFixed(1)}s]</span>
                          )}
                          {typeof log.details.count === 'number' && (
                            <span className="text-purple-400 ml-1">({log.details.count} results)</span>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
              {isStreaming && (
                <div className="flex items-center gap-2 py-2 text-blue-400 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Waiting for AI response...</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Stats Banner */}
      {discoveredLeads.length > 0 && (
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary-50 to-purple-50 rounded-lg flex-wrap">
          <div className="flex items-center gap-2">
            {isStreaming ? (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            <span className="font-medium text-gray-900">
              {isViewingFromHistory ? 'Loaded' : isStreaming ? 'Finding' : 'Found'} {discoveredLeads.length} {isViewingFromHistory ? 'unsaved' : 'potential'} bloggers
            </span>
          </div>
          {isViewingFromHistory && (
            <div className="flex items-center gap-2 text-blue-600">
              <History className="w-4 h-4" />
              <span className="text-sm">From previous session - ready to save</span>
            </div>
          )}
          {!isViewingFromHistory && filteredOutCount > 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <Building2 className="w-4 h-4" />
              <span className="text-sm">
                {filteredOutCount} corporate sites filtered out
              </span>
            </div>
          )}
          {searchedKeywords.length > 0 && (
            <div className="flex items-center gap-2 text-purple-600">
              <Tag className="w-4 h-4" />
              <span className="text-sm">
                {searchedKeywords.length} keywords searched
              </span>
            </div>
          )}
        </div>
      )}

      {discoveredLeads.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-4">
              <h2 className="font-semibold text-gray-900">
                {isViewingFromHistory ? 'Unsaved Leads' : 'Discovered Bloggers'}
              </h2>
              <button
                onClick={selectAll}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                {selectedLeads.size === discoveredLeads.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedLeads.size} selected
              </span>
              <button
                onClick={handleSaveSelected}
                disabled={selectedLeads.size === 0 || saveLeadsMutation.isPending}
                className="btn btn-secondary text-sm flex items-center gap-1"
              >
                {saveLeadsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Selected
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saveLeadsMutation.isPending}
                className="btn btn-primary text-sm flex items-center gap-1"
              >
                {saveLeadsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Save All
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {discoveredLeads.map((lead) => (
              <div
                key={lead.url}
                className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                  selectedLeads.has(lead.url) ? 'bg-primary-50' : ''
                }`}
                onClick={() => toggleSelectLead(lead.url)}
              >
                <input
                  type="checkbox"
                  checked={selectedLeads.has(lead.url)}
                  onChange={() => toggleSelectLead(lead.url)}
                  className="w-4 h-4 mt-1 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {getBlogTypeIcon(lead.blogType)}
                    <p className="font-medium text-gray-900 truncate">
                      {highlightKeyword(lead.title || lead.url, lead.matchedKeyword)}
                    </p>
                    {lead.isWordPress && (
                      <span className="badge badge-success text-xs">WordPress</span>
                    )}
                    {getBlogTypeBadge(lead.blogType)}
                    {lead.isGoodTarget && (
                      <span className="badge bg-green-100 text-green-800 text-xs flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Good Target
                      </span>
                    )}
                    {lead.email && (
                      <span className="badge bg-blue-100 text-blue-800 text-xs flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Has Email
                      </span>
                    )}
                    {lead.matchedKeyword && (
                      <span className="badge bg-yellow-100 text-yellow-800 text-xs flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {lead.matchedKeyword}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{lead.url}</p>
                  {lead.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {highlightKeyword(lead.description, lead.matchedKeyword)}
                    </p>
                  )}
                  {lead.blogClassification?.niche && (
                    <p className="text-xs text-purple-600 mt-1">
                      Niche: {lead.blogClassification.niche}
                    </p>
                  )}
                  {lead.blogClassification?.reasoning && (
                    <p className="text-xs text-gray-500 mt-1 italic">
                      "{lead.blogClassification.reasoning}"
                    </p>
                  )}
                  {lead.blogClassification && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnalysis(lead);
                      }}
                      className="text-xs text-primary-600 hover:text-primary-700 mt-2 flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      View Full Analysis
                    </button>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 text-sm text-gray-500">
                  <div className="flex items-center gap-4">
                    {lead.traffic && (
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        <span>{lead.traffic.toLocaleString()}</span>
                      </div>
                    )}
                    <a
                      href={lead.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary-600 hover:text-primary-700"
                      title="Open website"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-700">Score:</span>
                    <span
                      className={`font-bold text-lg ${
                        lead.score >= 70
                          ? 'text-green-600'
                          : lead.score >= 40
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {lead.score}
                    </span>
                  </div>
                  {lead.blogClassification?.confidence && (
                    <div className="text-xs text-gray-400">
                      {lead.blogClassification.confidence}% confidence
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isStreaming && discoveredLeads.length === 0 && logs.length === 0 && (
        <div className="card text-center py-12">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No discoveries yet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Enter keywords above to find WordPress bloggers in your niche.
            Our AI will analyze each site to identify personal bloggers 
            who are good collaboration targets, filtering out corporate sites.
          </p>
          <div className="mt-4 text-sm text-gray-400">
            <Zap className="w-4 h-4 inline mr-1" />
            Enable "Auto-expand Keywords" to automatically search with AI-suggested related terms
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      {selectedAnalysis && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                AI Analysis Results
              </h2>
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Site Info */}
              <div>
                <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  {getBlogTypeIcon(selectedAnalysis.blogType)}
                  {selectedAnalysis.title}
                </h3>
                <a
                  href={selectedAnalysis.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary-600 hover:underline flex items-center gap-1"
                >
                  {selectedAnalysis.url}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {selectedAnalysis.matchedKeyword && (
                  <p className="text-sm text-yellow-700 mt-2 flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    Found with keyword: <mark className="bg-yellow-200 px-1 rounded">{selectedAnalysis.matchedKeyword}</mark>
                  </p>
                )}
                {selectedAnalysis.description && (
                  <p className="text-sm text-gray-600 mt-2">{selectedAnalysis.description}</p>
                )}
              </div>

              {/* Classification Details */}
              {selectedAnalysis.blogClassification && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Blog Type</p>
                      <p className="font-medium text-gray-900 capitalize">
                        {selectedAnalysis.blogClassification.blogType}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Confidence</p>
                      <p className="font-medium text-gray-900">
                        {selectedAnalysis.blogClassification.confidence}%
                      </p>
                    </div>
                    {selectedAnalysis.blogClassification.niche && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Niche</p>
                        <p className="font-medium text-gray-900">
                          {selectedAnalysis.blogClassification.niche}
                        </p>
                      </div>
                    )}
                    {selectedAnalysis.blogClassification.estimatedAudience && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Target Audience</p>
                        <p className="font-medium text-gray-900">
                          {selectedAnalysis.blogClassification.estimatedAudience}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-xs text-blue-600 uppercase tracking-wide mb-1">AI Reasoning</p>
                    <p className="text-sm text-blue-900">
                      {selectedAnalysis.blogClassification.reasoning}
                    </p>
                  </div>

                  {/* Collaboration Assessment */}
                  <div className={`rounded-lg p-4 ${
                    selectedAnalysis.blogClassification.isGoodCollaborationTarget 
                      ? 'bg-green-50' 
                      : 'bg-yellow-50'
                  }`}>
                    <p className={`text-xs uppercase tracking-wide mb-1 ${
                      selectedAnalysis.blogClassification.isGoodCollaborationTarget
                        ? 'text-green-600'
                        : 'text-yellow-600'
                    }`}>
                      Collaboration Potential
                    </p>
                    <div className="flex items-center gap-2">
                      {selectedAnalysis.blogClassification.isGoodCollaborationTarget ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                      )}
                      <p className={`text-sm ${
                        selectedAnalysis.blogClassification.isGoodCollaborationTarget
                          ? 'text-green-900'
                          : 'text-yellow-900'
                      }`}>
                        {selectedAnalysis.blogClassification.collaborationPotentialReason}
                      </p>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Quick Stats</p>
                    <div className="flex flex-wrap gap-2">
                      <span className={`badge ${
                        selectedAnalysis.blogClassification.isPersonalBlog
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedAnalysis.blogClassification.isPersonalBlog ? '✓ Personal Blog' : 'Not Personal'}
                      </span>
                      <span className={`badge ${
                        selectedAnalysis.blogClassification.isCorporateSite
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedAnalysis.blogClassification.isCorporateSite ? '⚠ Corporate Site' : '✓ Not Corporate'}
                      </span>
                      {selectedAnalysis.email && (
                        <span className="badge bg-blue-100 text-blue-800">
                          ✓ Email Available
                        </span>
                      )}
                      {selectedAnalysis.traffic && (
                        <span className="badge bg-purple-100 text-purple-800">
                          ~{selectedAnalysis.traffic.toLocaleString()} monthly visitors
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end">
              <button
                onClick={() => setSelectedAnalysis(null)}
                className="btn btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
