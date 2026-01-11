import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Shield, 
  Users, 
  Building2, 
  Database, 
  Activity, 
  Settings, 
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { LoadingPage } from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

export const SuperAdmin = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTenants: 0,
    activeSessions: 0,
    systemHealth: 'healthy'
  });

  // Mock data - replace with actual API calls
  const [tenants, setTenants] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);

  useEffect(() => {
    // Fetch system statistics
    fetchSystemStats();
  }, []);

  const fetchSystemStats = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API calls
      // const response = await fetch('/api/super-admin/stats');
      // const data = await response.json();
      
      // Mock data for now
      setStats({
        totalUsers: 150,
        totalTenants: 12,
        activeSessions: 45,
        systemHealth: 'healthy'
      });
    } catch (error) {
      toast.error('Failed to fetch system statistics');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', name: 'Overview', icon: BarChart3 },
    { id: 'tenants', name: 'Tenants', icon: Building2 },
    { id: 'users', name: 'All Users', icon: Users },
    { id: 'system', name: 'System Settings', icon: Settings },
    { id: 'logs', name: 'System Logs', icon: Activity },
  ];

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'bg-blue-500',
      change: '+12%'
    },
    {
      title: 'Total Tenants',
      value: stats.totalTenants,
      icon: Building2,
      color: 'bg-green-500',
      change: '+2'
    },
    {
      title: 'Active Sessions',
      value: stats.activeSessions,
      icon: Activity,
      color: 'bg-purple-500',
      change: 'Live'
    },
    {
      title: 'System Health',
      value: stats.systemHealth === 'healthy' ? 'Healthy' : 'Warning',
      icon: stats.systemHealth === 'healthy' ? CheckCircle : AlertTriangle,
      color: stats.systemHealth === 'healthy' ? 'bg-green-500' : 'bg-yellow-500',
      change: 'All systems operational'
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <Shield className="h-6 w-6 text-yellow-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
            <p className="text-sm text-gray-600">System-wide management and monitoring</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchSystemStats}
            disabled={loading}
            className="btn btn-primary btn-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.change}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color} bg-opacity-10`}>
                <stat.icon className={`h-6 w-6 ${stat.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm
                  ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-5 w-5" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">System Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Recent Activity</h3>
                    <p className="text-sm text-gray-600">No recent activity to display</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-2">System Status</h3>
                    <div className="flex items-center space-x-2 mt-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm text-gray-600">All systems operational</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tenants' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Tenant Management</h2>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search tenants..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Tenant management features coming soon</p>
                <p className="text-sm text-gray-500 mt-2">View and manage all tenants in the system</p>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">All Users</h2>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">User management across all tenants coming soon</p>
                <p className="text-sm text-gray-500 mt-2">View and manage users from all tenants</p>
              </div>
            </div>
          )}

          {activeTab === 'system' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">System Settings</h2>
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">System-wide settings coming soon</p>
                <p className="text-sm text-gray-500 mt-2">Configure global system settings and preferences</p>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">System Logs</h2>
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">System audit logs coming soon</p>
                <p className="text-sm text-gray-500 mt-2">View system-wide activity and audit logs</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800">Super Admin Access</h3>
            <p className="text-sm text-yellow-700 mt-1">
              You have full system access. Use this power responsibly. All actions are logged and audited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
