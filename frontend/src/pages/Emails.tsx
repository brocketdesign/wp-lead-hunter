import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi, type EmailTemplate, type Lead } from '../lib/api';
import {
  Mail,
  Plus,
  Edit2,
  Trash2,
  Send,
  Loader2,
  FileText,
  Sparkles,
  X,
  Check,
  Download,
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Emails() {
  const api = useApi();
  const queryClient = useQueryClient();

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject: '',
    body: '',
  });

  const [showComposeModal, setShowComposeModal] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState({ subject: '', body: '' });

  // Fetch templates
  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/emails/templates'),
  });

  // Fetch leads for compose
  const { data: leadsData } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/leads'),
  });

  const templates = templatesData?.data || [];
  const leads = leadsData?.data || [];

  // Create/Update template mutation
  const templateMutation = useMutation({
    mutationFn: (data: { name: string; subject: string; body: string; id?: string }) => {
      if (data.id) {
        return api.put(`/emails/templates/${data.id}`, data);
      }
      return api.post('/emails/templates', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      closeTemplateModal();
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/emails/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });

  // Generate email mutation
  const generateMutation = useMutation({
    mutationFn: (data: { leadId: string; templateId: string }) =>
      api.post<{ subject: string; body: string }>('/emails/generate', data),
    onSuccess: (response) => {
      if (response.data) {
        setGeneratedEmail(response.data);
      }
    },
  });

  // Seed default templates mutation
  const seedTemplatesMutation = useMutation({
    mutationFn: () =>
      api.post<{ seeded: boolean; count: number; message: string }>('/emails/templates/initialize', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });

  const openTemplateModal = (template?: EmailTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        name: template.name,
        subject: template.subject,
        body: template.body,
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm({ name: '', subject: '', body: '' });
    }
    setShowTemplateModal(true);
  };

  const closeTemplateModal = () => {
    setShowTemplateModal(false);
    setEditingTemplate(null);
    setTemplateForm({ name: '', subject: '', body: '' });
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    templateMutation.mutate({
      ...templateForm,
      id: editingTemplate?.id,
    });
  };

  const openComposeModal = () => {
    setShowComposeModal(true);
    setSelectedLeadId('');
    setSelectedTemplateId('');
    setGeneratedEmail({ subject: '', body: '' });
  };

  const closeComposeModal = () => {
    setShowComposeModal(false);
    setSelectedLeadId('');
    setSelectedTemplateId('');
    setGeneratedEmail({ subject: '', body: '' });
  };

  const handleGenerate = () => {
    if (selectedLeadId && selectedTemplateId) {
      generateMutation.mutate({
        leadId: selectedLeadId,
        templateId: selectedTemplateId,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Templates</h1>
          <p className="text-gray-600 mt-1">
            Create and manage email templates for outreach campaigns.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openComposeModal}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Generate Email
          </button>
          <button
            onClick={() => openTemplateModal()}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {loadingTemplates ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : templates.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No templates yet
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            Create your first email template or load default templates to start sending personalized outreach emails.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => seedTemplatesMutation.mutate()}
              disabled={seedTemplatesMutation.isPending}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              {seedTemplatesMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Load Default Templates
            </button>
            <button
              onClick={() => openTemplateModal()}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Template
            </button>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openTemplateModal(template)}
                    className="p-1.5 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-100"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this template?')) {
                        deleteMutation.mutate(template.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Subject: {template.subject}
              </p>
              <p className="text-sm text-gray-500 line-clamp-3">{template.body}</p>
              <p className="text-xs text-gray-400 mt-3">
                Created {new Date(template.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <button
                onClick={closeTemplateModal}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTemplate} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g., Initial Outreach"
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={templateForm.subject}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, subject: e.target.value }))
                  }
                  placeholder="e.g., Partnership Opportunity for {{site_name}}"
                  className="input"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {'{{site_name}}'}, {'{{email}}'} for personalization
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Body
                </label>
                <textarea
                  value={templateForm.body}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, body: e.target.value }))
                  }
                  placeholder="Write your email template..."
                  rows={8}
                  className="input resize-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeTemplateModal}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={templateMutation.isPending}
                  className="btn btn-primary flex items-center gap-2"
                >
                  {templateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Generate Email</h2>
              <button
                onClick={closeComposeModal}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Lead
                  </label>
                  <select
                    value={selectedLeadId}
                    onChange={(e) => setSelectedLeadId(e.target.value)}
                    className="input"
                  >
                    <option value="">Choose a lead...</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.title || lead.url}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Template
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="input"
                  >
                    <option value="">Choose a template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!selectedLeadId || !selectedTemplateId || generateMutation.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate with AI
                  </>
                )}
              </button>

              {generatedEmail.subject && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Generated Subject
                    </label>
                    <input
                      type="text"
                      value={generatedEmail.subject}
                      onChange={(e) =>
                        setGeneratedEmail((g) => ({ ...g, subject: e.target.value }))
                      }
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Generated Body
                    </label>
                    <textarea
                      value={generatedEmail.body}
                      onChange={(e) =>
                        setGeneratedEmail((g) => ({ ...g, body: e.target.value }))
                      }
                      rows={10}
                      className="input resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn btn-secondary">Copy to Clipboard</button>
                    <button className="btn btn-primary flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      Send Email
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
