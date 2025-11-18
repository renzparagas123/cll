import { useState } from "react";
import {
    HomeIcon,
    ClipboardIcon,
    ChartBarSquareIcon,
    BuildingStorefrontIcon,
    UsersIcon,
    TruckIcon,
} from "@heroicons/react/24/outline";

const spaces = [
    { name: "Employee", icon: UsersIcon, color: "bg-orange-500" },
    { name: "Vehicles", icon: TruckIcon, color: "bg-cyan-400" },
];

export default function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className={`flex flex-col bg-white shadow h-screen transition-width duration-300 ${isCollapsed ? "w-20" : "w-64"}`}>
            <div className="flex items-center justify-between p-4 border-b">
                <span className={`font-bold text-lg ${isCollapsed ? "hidden" : "block"}`}>CLL Sellercenter</span>
                <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 rounded hover:bg-gray-100">
                    {isCollapsed ? "→" : "←"}
                </button>
            </div>

            <nav className="flex-1 p-4">
                {/* Main Links */}
                <div className="space-y-2">
                    <NavItem icon={ChartBarSquareIcon} label="Home" collapsed={isCollapsed} />
                    <NavItem icon={ BuildingStorefrontIcon} label="Orders" collapsed={isCollapsed} />
                </div>
            </nav>
        </div>
    );
}

function NavItem({ icon: Icon, label, collapsed, color }) {
    return (
        <div
            className={`flex items-center p-2 rounded hover:bg-gray-100 cursor-pointer ${collapsed ? "justify-center" : ""
                }`}
        >
            <Icon className={`h-5 w-5 ${color ? color + " text-white p-1 rounded" : "text-gray-600"}`} />
            {!collapsed && <span className="ml-2">{label}</span>}
        </div>
    );
}
