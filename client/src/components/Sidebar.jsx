import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    ShoppingBagIcon,
    ChartBarSquareIcon,
    BuildingStorefrontIcon,
    Cog6ToothIcon,
    ArrowPathIcon,
    UsersIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "../App";

export default function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const location = useLocation();
    const { role, hasPageAccess, isAdmin, loading, roleLoading } = useAuth();

    // All menu items with their required page access
    const allMenuItems = [
        { name: "Orders", icon: ShoppingBagIcon, path: "/orders", page: "orders" },
        { name: "Fast Fulfilment", icon: BuildingStorefrontIcon, path: "/ffr", page: "ffr" },
        { name: "Data Insights", icon: ChartBarSquareIcon, path: "/data_insights", page: "data_insights" },
        { name: "Sync Dashboard", icon: ArrowPathIcon, path: "/sync", page: "sync" },
        { name: "Settings", icon: Cog6ToothIcon, path: "/settings", page: "settings" },
        { name: "User Management", icon: UsersIcon, path: "/users", page: "users" },
    ];

    // Filter menu items based on role permissions
    const menuItems = allMenuItems.filter(item => hasPageAccess(item.page));

    const isActive = (path) => location.pathname === path;

    const getRoleBadgeColor = () => {
        switch (role) {
            case 'admin': return 'bg-red-100 text-red-700';
            case 'warehouse': return 'bg-blue-100 text-blue-700';
            case 'marketing': return 'bg-green-100 text-green-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (loading || roleLoading) {
        return (
            <div className={`flex flex-col bg-white shadow h-screen w-64`}>
                <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    return (
        <div className={`flex flex-col bg-white shadow h-screen transition-all duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
                <span className={`font-bold text-lg ${isCollapsed ? "hidden" : "block"}`}>
                    CLL Sellercenter
                </span>
                <button 
                    onClick={() => setIsCollapsed(!isCollapsed)} 
                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                >
                    {isCollapsed ? "→" : "←"}
                </button>
            </div>

            {/* Role Badge */}
            {!isCollapsed && role && (
                <div className="px-4 py-2">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor()}`}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                    </span>
                </div>
            )}

            {/* Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
                <div className="space-y-2">
                    {menuItems.map((item) => (
                        <NavItem
                            key={item.path}
                            icon={item.icon}
                            label={item.name}
                            path={item.path}
                            collapsed={isCollapsed}
                            active={isActive(item.path)}
                        />
                    ))}
                </div>
            </nav>

            {/* Footer - User Info */}
            {!isCollapsed && (
                <div className="p-4 border-t">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
                            {localStorage.getItem('lazada_account')?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                                {localStorage.getItem('lazada_account') || 'User'}
                            </p>
                            <p className="text-xs text-gray-500 uppercase">
                                {localStorage.getItem('lazada_country') || 'PH'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function NavItem({ icon: Icon, label, path, collapsed, active }) {
    return (
        <Link
            to={path}
            className={`flex items-center p-3 rounded-lg transition-colors ${
                collapsed ? "justify-center" : ""
            } ${
                active 
                    ? "bg-blue-50 text-blue-600 font-medium" 
                    : "text-gray-700 hover:bg-gray-100"
            }`}
        >
            <Icon className="h-5 w-5" />
            {!collapsed && <span className="ml-3">{label}</span>}
        </Link>
    );
}