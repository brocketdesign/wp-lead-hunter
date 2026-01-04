import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../lib/api';
import {
  Users,
  Search,
  Filter,
  ExternalLink,
  Mail,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  Target,
  Clock,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Lead {
  id: string;
  _id?: string;
  url: string;
  domain: string;
  title?: string;
  description?: string;
  email?: string;
  domainAge?: number;
  traffic?: number;
  qualificationScore?: number;
  score?: number;
  status: string;
  blogType?: 'personal' | 'indie' | 'corporate' | 'unknown';
  blogClassification?: {
    niche?: string;
    reasoning?: string;
    confidence?: number;
    isGoodCollaborationTarget?: boolean;
  };
  isActiveBlog?: boolean;
  lastPostDate?: string;
  postFrequency?: string;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

const statusOptions = ['all', 'DISCOVERED', 'QUALIFIED', 'CONTACTED', 'RESPONDED', 'CONVERTED', 'REJECTED'] as const;
const blogTypeOptions = ['all', 'personal', 'indie', 'corporate', 'unknown'] as const;

export default function Leads() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [blogTypeFilter, setBlogTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch user's saved leads
  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads', 'my'],
    queryFn: () => api.get<Lead[]>('/leads/my'),
  });

  // Fetch lead stats
  const { data: statsData } = useQuery({
    queryKey: ['leads', 'stats'],
    queryFn: () => api.get<{
      total: number;
      qualified: number;
      contacted: number;
      converted: number;
      byBlogType: Record<string, number>;
      avgScore: number;
    }>('/leads/my/stats'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/leads/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const leads = leadsData?.data || [];
  const stats = statsData?.data;
  
  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.domain?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesBlogType = blogTypeFilter === 'all' || lead.blogType === blogTypeFilter;
    return matchesSearch && matchesStatus && matchesBlogType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'DISCOVERED':
        return 'bg-gray-100 text-gray-800';
      case 'QUALIFIED':
        return 'bg-purple-100 text-purple-800';
      case 'CONTACTED':
        return 'bg-blue-100 text-blue-800';
      case 'RESPONDED':
        return 'bg-yellow-100 text-yellow-800';
      case 'CONVERTED':
        return 'bg-green-100 text-green-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
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
        return null;
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

  const score = (lead: Lead) => lead.qualificationScore || lead.score || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Leads</h1>
          <p className="text-gray-600 mt-1">
            Manage and track your saved WordPress blogger leads.
          </p>
        </div>
        <a
          href="/dashboard/discover"
          className="btn btn-primary flex items-center gap-2 w-fit"
        >
          <Search className="w-4 h-4" />
          Discover New
        </a>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-500">Total Leads</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Qualified</p>
            <p className="text-2xl font-bold text-purple-600">{stats.qualified}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Contacted</p>
            <p className="text-2xl font-bold text-blue-600">{stats.contacted}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Converted</p>
            <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Avg Score</p>
            <p className="text-2xl font-bold text-gray-900">{stats.avgScore}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search leads..."
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="input w-auto"
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status === 'all' ? 'All Statuses' : status}
                </option>
              ))}
            </select>
            <select
              value={blogTypeFilter}
              onChange={(e) => {
                setBlogTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="input w-auto"
            >
              {blogTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? 'All Types' : type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Leads List */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : paginatedLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No leads found</p>
            <p className="text-sm">
              {searchTerm || statusFilter !== 'all' || blogTypeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Start by discovering new WordPress bloggers'}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {paginatedLeads.map((lead) => (
                <div key={lead.id || lead._id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    {/* Lead Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {getBlogTypeIcon(lead.blogType)}
                        <a
                          href={lead.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 hover:text-primary-600 truncate flex items-center gap-1"
                        >
                          {lead.title || lead.domain || 'Untitled'}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                        {getBlogTypeBadge(lead.blogType)}
                        {lead.blogClassification?.isGoodCollaborationTarget && (
                          <span className="badge bg-green-100 text-green-800 text-xs flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Good Target
                          </span>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-500 truncate">{lead.url}</p>
                      
                      {lead.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-1">
                          {lead.description}
                        </p>
                      )}
                      
                      {/* Meta info row */}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {lead.blogClassification?.niche && (
                          <span className="text-purple-600">
                            Niche: {lead.blogClassification.niche}
                          </span>
                        )}
                        {lead.domainAge && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {lead.domainAge}mo old
                          </span>
                        )}
                        {lead.traffic && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {lead.traffic.toLocaleString()} visits
                          </span>
                        )}
                        {lead.postFrequency && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Posts: {lead.postFrequency}
                          </span>
                        )}
                        {lead.source && (
                          <span className="text-gray-400">
                            via: {lead.source}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: Score, Status, Actions */}
                    <div className="flex items-center gap-4">
                      {/* Score */}
                      <div className="text-center">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                score(lead) >= 70
                                  ? 'bg-green-500'
                                  : score(lead) >= 40
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              )}
                              style={{ width: `${score(lead)}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700">{score(lead)}</span>
                        </div>
                      </div>

                      {/* Status */}
                      <select
                        value={lead.status}
                        onChange={(e) =>
                          updateStatusMutation.mutate({
                            id: lead.id || lead._id || '',
                            status: e.target.value,
                          })
                        }
                        className={cn(
                          'badge cursor-pointer border-0 text-xs',
                          getStatusBadgeClass(lead.status)
                        )}
                      >
                        {statusOptions.slice(1).map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {lead.email && (
                          <a
                            href={`/dashboard/emails?leadId=${lead.id || lead._id}`}
                            className="p-2 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-100"
                            title="Send email"
                          >
                            <Mail className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this lead?')) {
                              deleteMutation.mutate(lead.id || lead._id || '');
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
                          title="Delete lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                  {Math.min(currentPage * itemsPerPage, filteredLeads.length)} of{' '}
                  {filteredLeads.length} leads
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
