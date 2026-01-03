import { useQuery } from '@tanstack/react-query';
import { useApi, type Lead } from '../lib/api';
import { Users, Search, Mail, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const stats = [
  { name: 'Total Leads', icon: Users, color: 'bg-blue-500' },
  { name: 'Discovered Today', icon: Search, color: 'bg-green-500' },
  { name: 'Emails Sent', icon: Mail, color: 'bg-purple-500' },
  { name: 'Conversion Rate', icon: TrendingUp, color: 'bg-orange-500' },
];

export default function Dashboard() {
  const api = useApi();
  
  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/leads'),
  });

  const leads = leadsData?.data || [];
  const totalLeads = leads.length;
  const newToday = leads.filter(l => {
    const today = new Date().toDateString();
    return new Date(l.createdAt).toDateString() === today;
  }).length;
  const contacted = leads.filter(l => l.status === 'contacted').length;
  const converted = leads.filter(l => l.status === 'converted').length;
  const conversionRate = totalLeads > 0 ? ((converted / totalLeads) * 100).toFixed(1) : '0';

  const statValues = [totalLeads, newToday, contacted, `${conversionRate}%`];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's your lead generation overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <div key={stat.name} className="card">
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 ${stat.color} rounded-lg flex items-center justify-center`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <span className="flex items-center text-sm text-green-600">
                <ArrowUpRight className="w-4 h-4" />
                12%
              </span>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold text-gray-900">{statValues[index]}</p>
              <p className="text-sm text-gray-500 mt-1">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity & Quick Actions */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Recent Leads</h2>
            <a href="/dashboard/leads" className="text-sm text-primary-600 hover:text-primary-700">
              View all
            </a>
          </div>
          <div className="space-y-3">
            {leads.slice(0, 5).map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 truncate">{lead.title || lead.url}</p>
                  <p className="text-sm text-gray-500 truncate">{lead.url}</p>
                </div>
                <span
                  className={`badge ml-3 ${
                    lead.status === 'new'
                      ? 'badge-info'
                      : lead.status === 'contacted'
                      ? 'badge-warning'
                      : lead.status === 'converted'
                      ? 'badge-success'
                      : 'badge-error'
                  }`}
                >
                  {lead.status}
                </span>
              </div>
            ))}
            {leads.length === 0 && (
              <p className="text-center text-gray-500 py-8">
                No leads yet. Start discovering WordPress blogs!
              </p>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <a
              href="/dashboard/discover"
              className="flex items-center gap-4 p-4 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Discover New Leads</p>
                <p className="text-sm text-gray-500">Find WordPress blogs by keywords</p>
              </div>
            </a>
            <a
              href="/dashboard/emails"
              className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Create Email Template</p>
                <p className="text-sm text-gray-500">Set up outreach templates</p>
              </div>
            </a>
            <a
              href="/dashboard/settings"
              className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-10 h-10 bg-orange-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Configure API Keys</p>
                <p className="text-sm text-gray-500">Set up OpenAI & Notion integration</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
