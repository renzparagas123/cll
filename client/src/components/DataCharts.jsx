import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from 'recharts';

// Import Supabase client from our setup file
import { supabase } from '../lib/supabase';

// Custom color palettes for different chart types
const CHART_COLORS = {
  primary: ['#1e3a5f', '#2d5a87', '#3d7ab0', '#4d9ad8'],
  secondary: ['#ff8c42', '#ffb366', '#ffd699', '#fff0cc'],
  accent: ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6'],
};

// Format large numbers
const formatNumber = (num) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
  return num?.toFixed(2) || '0';
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-xl">
        <p className="font-semibold text-gray-800 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {formatNumber(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Chart Card Component
const ChartCard = ({ title, children, onEditTitle, chartId }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);

  const handleSaveTitle = async () => {
    setIsEditing(false);
    if (onEditTitle) {
      await onEditTitle(chartId, editedTitle);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              onClick={handleSaveTitle}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedTitle(title);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              title="Edit title"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </>
        )}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
};

// CPAS Chart Component (matching your screenshot style)
const CPASChart = ({ data, title, colorScheme = 'primary' }) => {
  const colors = colorScheme === 'primary' 
    ? { spend: '#a8c5e2', gmv: '#1e3a5f' }
    : { spend: '#ffd699', gmv: '#ff8c42' };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="month" 
          tick={{ fill: '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: '#d1d5db' }}
        />
        <YAxis 
          yAxisId="left"
          tick={{ fill: '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: '#d1d5db' }}
          tickFormatter={formatNumber}
          label={{ value: 'Amount', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
        />
        <YAxis 
          yAxisId="right"
          orientation="right"
          tick={{ fill: '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: '#d1d5db' }}
          domain={[0, 25]}
          label={{ value: 'ROAS', angle: 90, position: 'insideRight', fill: '#6b7280' }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend 
          wrapperStyle={{ paddingTop: '20px' }}
          formatter={(value) => <span className="text-gray-700">{value}</span>}
        />
        <Bar 
          yAxisId="left"
          dataKey="spend" 
          name="CPAS Spend" 
          fill={colors.spend}
          radius={[4, 4, 0, 0]}
          label={{ 
            position: 'top', 
            fill: colors.spend,
            fontSize: 11,
            formatter: formatNumber 
          }}
        />
        <Bar 
          yAxisId="left"
          dataKey="gmv" 
          name="CPAS GMV" 
          fill={colors.gmv}
          radius={[4, 4, 0, 0]}
          label={{ 
            position: 'top', 
            fill: colors.gmv,
            fontSize: 11,
            fontWeight: 'bold',
            formatter: formatNumber 
          }}
        />
        <Line 
          yAxisId="right"
          type="monotone" 
          dataKey="roas" 
          name="ROAS" 
          stroke="#1a1a1a"
          strokeWidth={2}
          dot={{ fill: '#1a1a1a', strokeWidth: 2, r: 4 }}
          label={{ 
            position: 'top', 
            fill: '#1a1a1a',
            fontSize: 12,
            fontWeight: 'bold',
            formatter: (value) => value?.toFixed(2) 
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// File Upload Component
const FileUpload = ({ onUpload, isUploading }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  }, [onUpload]);

  const handleChange = useCallback((e) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  }, [onUpload]);

  return (
    <div
      className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
        ${dragActive 
          ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
          : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }
        ${isUploading ? 'pointer-events-none opacity-60' : ''}
      `}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      
      <div className="flex flex-col items-center gap-4">
        {isUploading ? (
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        ) : (
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
        )}
        
        <div>
          <p className="text-lg font-semibold text-gray-700">
            {isUploading ? 'Processing...' : 'Drop your Excel file here'}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            or click to browse • Supports .xlsx, .xls, .csv
          </p>
        </div>
      </div>
    </div>
  );
};

// Main DataCharts Component
const DataCharts = () => {
  const [charts, setCharts] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Fetch existing charts from Supabase on mount
  useEffect(() => {
    fetchCharts();
  }, []);

  const fetchCharts = async () => {
    try {
      const { data, error } = await supabase
        .from('charts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Parse the JSON data stored in Supabase
      const parsedCharts = data?.map(chart => ({
        ...chart,
        data: typeof chart.data === 'string' ? JSON.parse(chart.data) : chart.data
      })) || [];
      
      setCharts(parsedCharts);
    } catch (err) {
      console.error('Error fetching charts:', err);
      // If table doesn't exist, start with empty charts
      setCharts([]);
    }
  };

  const parseExcelFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get the first sheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          resolve({
            sheetName,
            data: jsonData,
            headers: jsonData.length > 0 ? Object.keys(jsonData[0]) : []
          });
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const detectChartType = (headers, data) => {
    // Auto-detect chart configuration based on data structure
    const lowerHeaders = headers.map(h => h.toLowerCase());
    
    // Check for CPAS-style data (like your screenshot)
    const hasSpend = lowerHeaders.some(h => h.includes('spend'));
    const hasGMV = lowerHeaders.some(h => h.includes('gmv') || h.includes('revenue') || h.includes('sales'));
    const hasROAS = lowerHeaders.some(h => h.includes('roas') || h.includes('roi'));
    
    if (hasSpend && hasGMV) {
      return {
        type: 'cpas',
        mappings: {
          month: headers.find(h => 
            h.toLowerCase().includes('month') || 
            h.toLowerCase().includes('date') || 
            h.toLowerCase().includes('period')
          ) || headers[0],
          spend: headers.find(h => h.toLowerCase().includes('spend')) || headers[1],
          gmv: headers.find(h => 
            h.toLowerCase().includes('gmv') || 
            h.toLowerCase().includes('revenue') || 
            h.toLowerCase().includes('sales')
          ) || headers[2],
          roas: headers.find(h => 
            h.toLowerCase().includes('roas') || 
            h.toLowerCase().includes('roi')
          )
        }
      };
    }
    
    // Default to bar chart
    return {
      type: 'bar',
      mappings: {
        xAxis: headers[0],
        values: headers.slice(1)
      }
    };
  };

  const handleFileUpload = async (file) => {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Parse the Excel file
      const { sheetName, data, headers } = await parseExcelFile(file);
      
      if (data.length === 0) {
        throw new Error('The uploaded file contains no data');
      }

      // Detect chart type and mappings
      const chartConfig = detectChartType(headers, data);
      
      // Transform data for the chart
      let chartData;
      if (chartConfig.type === 'cpas') {
        chartData = data.map(row => ({
          month: row[chartConfig.mappings.month],
          spend: parseFloat(row[chartConfig.mappings.spend]) || 0,
          gmv: parseFloat(row[chartConfig.mappings.gmv]) || 0,
          roas: chartConfig.mappings.roas 
            ? parseFloat(row[chartConfig.mappings.roas]) || 0
            : (parseFloat(row[chartConfig.mappings.gmv]) / parseFloat(row[chartConfig.mappings.spend])) || 0
        }));
      } else {
        chartData = data;
      }

      // Create chart object
      const newChart = {
        title: sheetName || file.name.replace(/\.[^/.]+$/, ''),
        chart_type: chartConfig.type,
        data: chartData,
        config: chartConfig,
        file_name: file.name,
        created_at: new Date().toISOString()
      };

      // Save to Supabase
      const { data: savedChart, error: saveError } = await supabase
        .from('charts')
        .insert([{
          title: newChart.title,
          chart_type: newChart.chart_type,
          data: JSON.stringify(newChart.data),
          config: JSON.stringify(newChart.config),
          file_name: newChart.file_name
        }])
        .select()
        .single();

      if (saveError) {
        console.warn('Supabase save error:', saveError);
        // Continue without saving - show chart locally
        setCharts(prev => [{ ...newChart, id: Date.now() }, ...prev]);
      } else {
        setCharts(prev => [{
          ...savedChart,
          data: chartData,
          config: chartConfig
        }, ...prev]);
      }

      setSuccessMessage(`Successfully uploaded "${file.name}"!`);
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err) {
      setError(err.message || 'Failed to process the file');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditTitle = async (chartId, newTitle) => {
    try {
      const { error } = await supabase
        .from('charts')
        .update({ title: newTitle })
        .eq('id', chartId);

      if (error) throw error;

      setCharts(prev => 
        prev.map(chart => 
          chart.id === chartId ? { ...chart, title: newTitle } : chart
        )
      );
    } catch (err) {
      console.error('Error updating title:', err);
      // Update locally anyway
      setCharts(prev => 
        prev.map(chart => 
          chart.id === chartId ? { ...chart, title: newTitle } : chart
        )
      );
    }
  };

  const handleDeleteChart = async (chartId) => {
    try {
      const { error } = await supabase
        .from('charts')
        .delete()
        .eq('id', chartId);

      if (error) throw error;
      
      setCharts(prev => prev.filter(chart => chart.id !== chartId));
    } catch (err) {
      console.error('Error deleting chart:', err);
      // Delete locally anyway
      setCharts(prev => prev.filter(chart => chart.id !== chartId));
    }
  };

  const renderChart = (chart, index) => {
    const colorScheme = index % 2 === 0 ? 'primary' : 'secondary';
    
    if (chart.chart_type === 'cpas') {
      return (
        <CPASChart 
          data={chart.data} 
          title={chart.title}
          colorScheme={colorScheme}
        />
      );
    }

    // Default bar chart for other data types
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chart.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey={Object.keys(chart.data[0])[0]} 
            tick={{ fill: '#6b7280', fontSize: 12 }}
          />
          <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {Object.keys(chart.data[0]).slice(1).map((key, i) => (
            <Bar 
              key={key}
              dataKey={key} 
              fill={CHART_COLORS.accent[i % CHART_COLORS.accent.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Data Charts</h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload Excel files to visualize your data
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {charts.length} chart{charts.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Section */}
        <section className="mb-12">
          <FileUpload onUpload={handleFileUpload} isUploading={isUploading} />
          
          {/* Messages */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMessage}
            </div>
          )}
        </section>

        {/* Charts Grid */}
        {charts.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-6">Your Charts</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {charts.map((chart, index) => (
                <div key={chart.id} className="relative group">
                  <ChartCard 
                    title={chart.title} 
                    chartId={chart.id}
                    onEditTitle={handleEditTitle}
                  >
                    {renderChart(chart, index)}
                  </ChartCard>
                  
                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteChart(chart.id)}
                    className="absolute top-4 right-16 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete chart"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="text-center py-16">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No charts yet</h3>
            <p className="text-gray-500">Upload an Excel file to create your first visualization</p>
          </section>
        )}
      </main>
    </div>
  );
};

export default DataCharts;