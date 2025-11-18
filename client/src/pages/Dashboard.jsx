import  Sidebar  from "../components/Sidebar";
import { TopNav } from "../components/TopNav";


export default function Dashboard() {
    const handleLogout = () => {
        console.log("Logging out...");
    };
    return (
        <div className="flex flex-col md:flex-row w-full min-h-screen bg-gray-100">
            {/* Sidebar for md and above */}
            <Sidebar />
            {/* Main content */}
            <div className="flex-1 flex flex-col">
                <TopNav onLogout={handleLogout} />


                <div className="p-6">
                     {/* table data must be here */}
                     <div>Sample123</div>
                </div>
            </div>
        </div>
    );
}