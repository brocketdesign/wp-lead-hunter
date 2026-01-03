import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../lib/api';
import {
  Search,
  Globe,
  Clock,
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle,
  Plus,
} from 'lucide-react';

interface DiscoveredLead {
  url: string;
  title?: string;
  description?: string;
  email?: string;
  isWordPress: boolean;
  domainAge?: number;
  traffic?: number;
  score: number;
}

export default function Discover() {
  const api = useApi();
  const queryClient = useQueryClient();
  
  const [keywords, setKeywords] = useState('');
  const [minDomainAge, setMinDomainAge] = useState(6);
  const [minTraffic, setMinTraffic] = useState(1000);
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  const discoverMutation = useMutation({
    mutationFn: (data: { keywords: string[]; minDomainAge?: number; minTraffic?: number }) =>
      api.post<{ leads: DiscoveredLead[] }>('/leads/discover', data),
    onSuccess: (response) => {
      if (response.data?.leads) {
        setDiscoveredLeads(response.data.leads);
        setSelectedLeads(new Set());
      }
    },
  });

  const addLeadsMutation = useMutation({
    mutationFn: (leads: DiscoveredLead[]) =>
      Promise.all(leads.map((lead) => api.post('/leads', lead))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      // Remove added leads from discovered list
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
      minDomainAge,
      minTraffic,
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

  const handleAddSelected = () => {
    const leadsToAdd = discoveredLeads.filter((lead) => selectedLeads.has(lead.url));
    addLeadsMutation.mutate(leadsToAdd);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Discover Leads</h1>
        <p className="text-gray-600 mt-1">
          Find new WordPress blogs based on keywords and qualification criteria.
        </p>
      </div>

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
                placeholder="e.g., travel blog, food recipes, tech news"
                className="input pl-10"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter comma-separated keywords to search for WordPress blogs
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Clock className="w-4 h-4 inline mr-1" />
                Min Domain Age (months)
              </label>
              <input
                type="number"
                value={minDomainAge}
                onChange={(e) => setMinDomainAge(parseInt(e.target.value) || 0)}
                min={0}
                className="input"
              />
            </div>
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
          </div>

          <button
            type="submit"
            disabled={!keywords.trim() || discoverMutation.isPending}
            className="btn btn-primary flex items-center gap-2"
          >
            {discoverMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Discover Blogs
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

      {discoveredLeads.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
            <h2 className="font-semibold text-gray-900">
              Discovered {discoveredLeads.length} Blogs
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedLeads.size} selected
              </span>
              <button
                onClick={handleAddSelected}
                disabled={selectedLeads.size === 0 || addLeadsMutation.isPending}
                className="btn btn-primary text-sm flex items-center gap-1"
              >
                {addLeadsMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Add Selected
              </button>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {discoveredLeads.map((lead) => (
              <div
                key={lead.url}
                className={`flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                  selectedLeads.has(lead.url) ? 'bg-primary-50' : ''
                }`}
                onClick={() => toggleSelectLead(lead.url)}
              >
                <input
                  type="checkbox"
                  checked={selectedLeads.has(lead.url)}
                  onChange={() => toggleSelectLead(lead.url)}
                  className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <p className="font-medium text-gray-900 truncate">
                      {lead.title || lead.url}
                    </p>
                    {lead.isWordPress && (
                      <span className="badge badge-success text-xs">WordPress</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{lead.url}</p>
                  {lead.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {lead.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-6 text-sm text-gray-500">
                  {lead.domainAge && (
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{lead.domainAge}mo</span>
                    </div>
                  )}
                  {lead.traffic && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>{lead.traffic.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-gray-700">Score:</span>
                    <span
                      className={`font-bold ${
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
            Enter keywords above to search for WordPress blogs matching your criteria.
            We'll analyze each site for WordPress detection, domain age, and estimated traffic.
          </p>
        </div>
      )}
    </div>
  );
}
