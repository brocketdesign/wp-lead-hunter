import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi, type UserSettings } from '../lib/api';
import { Key, Database, Eye, EyeOff, Save, Check, AlertCircle, Loader2 } from 'lucide-react';

export default function Settings() {
  const api = useApi();
  const queryClient = useQueryClient();
  
  const [openaiKey, setOpenaiKey] = useState('');
  const [notionKey, setNotionKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch current settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserSettings>('/user/settings'),
  });

  const settings = settingsData?.data;

  // Update notionDbId when settings are loaded
  useEffect(() => {
    if (settings?.notionDatabaseId) {
      setNotionDbId(settings.notionDatabaseId);
    }
  }, [settings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (data: { openaiApiKey?: string; notionApiKey?: string; notionDatabaseId?: string }) =>
      api.put('/user/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      // Clear the input fields after saving
      setOpenaiKey('');
      setNotionKey('');
    },
  });

  const handleSaveOpenAI = () => {
    if (openaiKey) {
      updateMutation.mutate({ openaiApiKey: openaiKey });
    }
  };

  const handleSaveNotion = () => {
    updateMutation.mutate({
      ...(notionKey && { notionApiKey: notionKey }),
      notionDatabaseId: notionDbId,
    });
  };

  const handleClearOpenAI = () => {
    updateMutation.mutate({ openaiApiKey: '' });
  };

  const handleClearNotion = () => {
    updateMutation.mutate({ notionApiKey: '', notionDatabaseId: '' });
    setNotionDbId('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          Configure your API keys for OpenAI and Notion integration.
        </p>
      </div>

      {/* Success notification */}
      {saveSuccess && (
        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-lg">
          <Check className="w-5 h-5" />
          <span>Settings saved successfully!</span>
        </div>
      )}

      {/* OpenAI Configuration */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">OpenAI API Key</h2>
            <p className="text-sm text-gray-500">Required for AI-powered email generation</p>
          </div>
        </div>

        {/* Current status */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {settings?.hasOpenaiKey ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700">
                  API Key configured: <code className="bg-gray-200 px-2 py-0.5 rounded">{settings.openaiKeyPreview}</code>
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-gray-700">No API key configured</span>
              </>
            )}
          </div>
        </div>

        {/* Input field */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showOpenaiKey ? 'text' : 'password'}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowOpenaiKey(!showOpenaiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showOpenaiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveOpenAI}
              disabled={!openaiKey || updateMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Key
            </button>
            {settings?.hasOpenaiKey && (
              <button
                onClick={handleClearOpenAI}
                disabled={updateMutation.isPending}
                className="btn btn-danger"
              >
                Remove Key
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Get your API key from{' '}
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            OpenAI Dashboard
          </a>
        </p>
      </div>

      {/* Notion Configuration */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notion Integration</h2>
            <p className="text-sm text-gray-500">Sync leads with your Notion workspace</p>
          </div>
        </div>

        {/* Current status */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {settings?.hasNotionKey ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700">
                  API Key configured: <code className="bg-gray-200 px-2 py-0.5 rounded">{settings.notionKeyPreview}</code>
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-yellow-600" />
                <span className="text-sm text-gray-700">No API key configured</span>
              </>
            )}
          </div>
        </div>

        {/* Input fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notion API Key
            </label>
            <div className="relative">
              <input
                type={showNotionKey ? 'text' : 'password'}
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
                placeholder="secret_..."
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNotionKey(!showNotionKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNotionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notion Database ID
            </label>
            <input
              type="text"
              value={notionDbId}
              onChange={(e) => setNotionDbId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="input"
            />
            <p className="mt-1 text-xs text-gray-500">
              Found in the URL of your Notion database page
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveNotion}
              disabled={updateMutation.isPending}
              className="btn btn-primary flex items-center gap-2"
            >
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Notion Settings
            </button>
            {settings?.hasNotionKey && (
              <button
                onClick={handleClearNotion}
                disabled={updateMutation.isPending}
                className="btn btn-danger"
              >
                Remove Integration
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Create an integration at{' '}
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline"
          >
            Notion Integrations
          </a>
        </p>
      </div>

      {/* Info Card */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Security Note</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your API keys are encrypted and stored securely. They are only used server-side
              and never exposed to the browser after saving.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
