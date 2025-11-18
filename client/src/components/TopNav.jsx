import { useState, useRef, useEffect } from "react";

export const TopNav = ({ onLogout }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown if clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="w-full h-16 bg-white shadow flex justify-end items-center px-4 md:px-6">
      <div className="relative" ref={dropdownRef}>
        {/* Profile Circle */}
        <div
          className="w-10 h-10 rounded-full bg-gray-300 cursor-pointer"
          onClick={() => setOpen(!open)}
        ></div>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 mt-2 w-32 bg-white shadow-md rounded p-2">
            <button
              onClick={onLogout}
              className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
