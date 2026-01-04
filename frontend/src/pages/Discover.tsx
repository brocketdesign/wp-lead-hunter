import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../lib/api';
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
}

interface DiscoveryResult {
  leads: DiscoveredLead[];
  suggestedKeywords: string[];
  totalFound: number;
  filteredOut: number;
  discoverySessionId: string;
}

interface DiscoverySession {
  sessionId: string;
  source: string;
  leadCount: number;
  unsavedCount: number;
  createdAt: string;
}

export default function Discover() {
  const api = useApi();
  const queryClient = useQueryClient();
  
  const [keywords, setKeywords] = useState('');
  const [minTraffic, setMinTraffic] = useState(500);
  const [filterCorporate, setFilterCorporate] = useState(true);
  const [language, setLanguage] = useState(''); // Empty = all languages
  const [excludeWordPressCom, setExcludeWordPressCom] = useState(true); // Exclude hosted wordpress.com blogs
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [discoverySessionId, setDiscoverySessionId] = useState<string | null>(null);
  const [suggestedKeywords, setSuggestedKeywords] = useState<string[]>([]);
  const [filteredOutCount, setFilteredOutCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState<DiscoveredLead | null>(null);
  const [isViewingFromHistory, setIsViewingFromHistory] = useState(false);

  // Fetch discovery history
  const { data: sessionsData } = useQuery({
    queryKey: ['discovery-sessions'],
    queryFn: () => api.get<DiscoverySession[]>('/leads/my/sessions'),
  });

  // Fetch unsaved leads from a session
  const loadSessionLeadsMutation = useMutation({
    mutationFn: (sessionId: string) => 
      api.get<DiscoveredLead[]>(`/leads/my/sessions/${sessionId}/unsaved`),
    onSuccess: (response) => {
      if (response.data) {
        setDiscoveredLeads(response.data);
        setSelectedLeads(new Set());
        setSuggestedKeywords([]);
        setFilteredOutCount(0);
        setIsViewingFromHistory(true);
      }
    },
  });

  const discoverMutation = useMutation({
    mutationFn: (data: { 
      keywords: string[]; 
      minTraffic?: number;
      filterCorporate?: boolean;
      language?: string;
      excludeWordPressCom?: boolean;
    }) => api.post<DiscoveryResult>('/leads/discover', data),
    onSuccess: (response) => {
      if (response.data) {
        setDiscoveredLeads(response.data.leads || []);
        setSelectedLeads(new Set());
        setDiscoverySessionId(response.data.discoverySessionId);
        setSuggestedKeywords(response.data.suggestedKeywords || []);
        setFilteredOutCount(response.data.filteredOut || 0);
        setIsViewingFromHistory(false);
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

  const handleDiscover = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keywords.trim()) return;
    
    const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    discoverMutation.mutate({
      keywords: keywordList,
      minTraffic,
      filterCorporate,
      language: language || undefined, // Only send if selected
      excludeWordPressCom,
    });
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

  return (
    <div className="space-y-6">
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
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter comma-separated keywords to find WordPress bloggers in your niche
            </p>
          </div>

          {/* Suggested Keywords */}
          {suggestedKeywords.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Suggested Keywords
              </label>
              <div className="flex flex-wrap gap-2">
                {suggestedKeywords.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => addSuggestedKeyword(kw)}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                  >
                    + {kw}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
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

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterCorporate}
                  onChange={(e) => setFilterCorporate(e.target.checked)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
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
                />
                <span className="text-sm font-medium text-gray-700">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Self-hosted Only
                </span>
              </label>
              <span className="ml-1 text-xs text-gray-500" title="Exclude *.wordpress.com hosted blogs">
                (no wordpress.com)
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={!keywords.trim() || discoverMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {discoverMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Discovering & Analyzing...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Discover Bloggers
              </>
            )}
          </button>
        </form>
      </div>

      {/* Results */}
      {discoverMutation.isError && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>Failed to discover leads. Please try again.</span>
        </div>
      )}

      {/* Stats Banner */}
      {discoveredLeads.length > 0 && (
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-primary-50 to-purple-50 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-gray-900">
              {isViewingFromHistory ? 'Loaded' : 'Found'} {discoveredLeads.length} {isViewingFromHistory ? 'unsaved' : 'potential'} bloggers
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
                      {lead.title || lead.url}
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
                  </div>
                  <p className="text-sm text-gray-500 truncate">{lead.url}</p>
                  {lead.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {lead.description}
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
      {!discoverMutation.isPending && discoveredLeads.length === 0 && (
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
