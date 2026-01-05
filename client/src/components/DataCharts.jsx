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
  LabelList,
} from 'recharts';

// Import Supabase client from our setup file
import { supabase } from '../lib/supabase';

// Format large numbers (e.g., 1510000 -> "1.51M", 119150 -> "119.15K")
const formatNumber = (num) => {
  const n = Number(num);
  if (isNaN(n)) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toFixed(2);
};

// Format Y-axis ticks
const formatYAxis = (num) => {
  const n = Number(num);
  if (isNaN(n)) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toString();
};

// Custom label component for Spend bars (italic, light color, positioned above)
const SpendLabel = ({ x, y, width, value, fill }) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      fill={fill || '#7eb8e7'}
      textAnchor="middle"
      fontSize={11}
      fontStyle="italic"
    >
      {formatNumber(Number(value))}
    </text>
  );
};

// Custom label component for GMV bars (bold, white text inside bar)
const GMVLabel = ({ x, y, width, value }) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  return (
    <text
      x={x + width / 2}
      y={y + 22}
      fill="#ffffff"
      textAnchor="middle"
      fontSize={12}
      fontWeight="bold"
    >
      {formatNumber(Number(value))}
    </text>
  );
};

// Custom label component for ROAS line points
const ROASLabel = ({ x, y, value }) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  return (
    <text
      x={x}
      y={y - 12}
      fill="#000000"
      textAnchor="middle"
      fontSize={12}
    >
      {Number(value).toFixed(2)}
    </text>
  );
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#333', marginBottom: '8px' }}>{label}</p>
        {payload.map((entry, index) => {
          const val = Number(entry.value);
          const displayVal = isNaN(val) ? '0' : (entry.name === 'ROAS' ? val.toFixed(2) : formatNumber(val));
          return (
            <p key={index} style={{ margin: '4px 0', fontSize: '13px', color: entry.color }}>
              {entry.name}: {displayVal}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// Chart Card Component with editable title
const ChartCard = ({ title, children, onEditTitle, chartId, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);

  const handleSaveTitle = async () => {
    setIsEditing(false);
    if (onEditTitle) {
      await onEditTitle(chartId, editedTitle);
    }
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      border: '1px solid #f0f0f0',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '2px solid #3b82f6',
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none'
              }}
              autoFocus
            />
            <button
              onClick={handleSaveTitle}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Save
            </button>
            <button
              onClick={() => { setIsEditing(false); setEditedTitle(title); }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#e5e7eb',
                color: '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>{title}</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setIsEditing(true)}
                style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#9ca3af' }}
                title="Edit title"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
              <button
                onClick={() => onDelete && onDelete(chartId)}
                style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#9ca3af' }}
                title="Delete chart"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
};

// CPAS Chart Component - Matching exact screenshot style
const CPASChart = ({ data, title, colorScheme = 'lazada' }) => {
  // Color schemes: Lazada (blue) and Shopee (orange)
  const colors = colorScheme === 'lazada' 
    ? { spend: '#b8d4e8', gmv: '#1e3a5f', spendLabel: '#6baed6' }
    : { spend: '#ffd699', gmv: '#ff8c42', spendLabel: '#ffb366' };

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart 
          data={data} 
          margin={{ top: 30, right: 50, left: 10, bottom: 20 }}
          barGap={0}
          barCategoryGap="25%"
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="#e0e0e0" 
            vertical={false}
          />
          <XAxis 
            dataKey="month" 
            tick={{ fill: '#333', fontSize: 12 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
          />
          <YAxis 
            yAxisId="left"
            tick={{ fill: '#333', fontSize: 11 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
            tickFormatter={formatYAxis}
            domain={[0, 'auto']}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#333', fontSize: 11 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
            domain={[0, 25]}
            tickFormatter={(v) => {
              const num = Number(v);
              return isNaN(num) ? '0' : num.toFixed(2);
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top"
            align="center"
            iconType="square"
            iconSize={12}
            wrapperStyle={{ paddingBottom: '15px' }}
            formatter={(value) => <span style={{ color: '#333', fontSize: '12px', marginRight: '15px' }}>{value}</span>}
          />
          
          {/* Spend Bars */}
          <Bar 
            yAxisId="left"
            dataKey="spend" 
            name="CPAS Spend" 
            fill={colors.spend}
            maxBarSize={55}
          >
            <LabelList 
              dataKey="spend" 
              content={(props) => <SpendLabel {...props} fill={colors.spendLabel} />}
            />
          </Bar>
          
          {/* GMV Bars */}
          <Bar 
            yAxisId="left"
            dataKey="gmv" 
            name="CPAS GMV" 
            fill={colors.gmv}
            maxBarSize={55}
          >
            <LabelList 
              dataKey="gmv" 
              content={<GMVLabel />}
            />
          </Bar>
          
          {/* ROAS Line */}
          <Line 
            yAxisId="right"
            type="linear" 
            dataKey="roas" 
            name="ROAS" 
            stroke="#000000"
            strokeWidth={2}
            dot={{ fill: '#000', r: 4 }}
          >
            <LabelList 
              dataKey="roas" 
              content={<ROASLabel />}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Chart Title at Bottom Center */}
      <div style={{ textAlign: 'center', marginTop: '-10px' }}>
        <span style={{ fontSize: '13px', color: '#333' }}>{title}</span>
      </div>
    </div>
  );
};

// File Upload Component - Compact version
const FileUpload = ({ onUpload, isUploading }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) onUpload(e.dataTransfer.files[0]);
  }, [onUpload]);

  const handleChange = useCallback((e) => {
    if (e.target.files?.[0]) onUpload(e.target.files[0]);
  }, [onUpload]);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '12px',
        border: `1px solid ${dragActive ? '#3b82f6' : '#e5e7eb'}`,
        borderRadius: '10px',
        padding: '12px 20px',
        backgroundColor: dragActive ? '#eff6ff' : '#ffffff',
        cursor: 'pointer',
        opacity: isUploading ? 0.6 : 1,
        transition: 'all 0.2s ease'
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleChange}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
        disabled={isUploading}
      />
      
      {isUploading ? (
        <div style={{ width: '20px', height: '20px', border: '2px solid #dbeafe', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      ) : (
        <svg width="20" height="20" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )}
      
      <div>
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
          {isUploading ? 'Uploading...' : 'Upload Excel'}
        </span>
        <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>
          .xlsx, .xls, .csv
        </span>
      </div>
      
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// Main DataCharts Component
const DataCharts = () => {
  const [charts, setCharts] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => { fetchCharts(); }, []);

  const fetchCharts = async () => {
    try {
      const { data, error } = await supabase
        .from('charts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setCharts(data?.map(chart => ({
        ...chart,
        data: typeof chart.data === 'string' ? JSON.parse(chart.data) : chart.data,
        config: typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config
      })) || []);
    } catch (err) {
      console.error('Error fetching charts:', err);
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
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Get raw data as array of arrays to detect layout
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          // Check if data is horizontal (row-based) like:
          // Row 0: [Platform, January, February, March, ...]
          // Row 1: [CPAS Spend, 119.15K, 138.00K, ...]
          // Row 2: [CPAS GMV, 1.51M, 1.51M, ...]
          // Row 3: [ROAS, 12.71, 10.98, ...]
          
          const firstCol = rawData.map(row => row[0]?.toString().toLowerCase() || '');
          const isHorizontalLayout = firstCol.some(cell => 
            cell.includes('spend') || cell.includes('gmv') || cell.includes('roas')
          );
          
          let jsonData, headers;
          
          if (isHorizontalLayout) {
            // Transform horizontal data to vertical format
            const months = rawData[0].slice(1); // Get month names from first row
            const transformedData = [];
            
            // Find the rows for spend, gmv, and roas
            let spendRow, gmvRow, roasRow;
            rawData.forEach((row, index) => {
              const label = row[0]?.toString().toLowerCase() || '';
              if (label.includes('spend')) spendRow = index;
              else if (label.includes('gmv')) gmvRow = index;
              else if (label.includes('roas')) roasRow = index;
            });
            
            // Build vertical data
            months.forEach((month, i) => {
              if (month) {
                const colIndex = i + 1;
                transformedData.push({
                  month: month,
                  spend: parseValue(rawData[spendRow]?.[colIndex]),
                  gmv: parseValue(rawData[gmvRow]?.[colIndex]),
                  roas: parseFloat(rawData[roasRow]?.[colIndex]) || 0
                });
              }
            });
            
            jsonData = transformedData;
            headers = ['month', 'spend', 'gmv', 'roas'];
          } else {
            // Standard vertical layout
            jsonData = XLSX.utils.sheet_to_json(worksheet);
            headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
          }
          
          resolve({ sheetName, data: jsonData, headers, isHorizontalLayout });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Helper function to parse values like "119.15K", "1.51M", etc.
  const parseValue = (val) => {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    
    const str = val.toString().trim().toUpperCase();
    const num = parseFloat(str);
    
    if (str.endsWith('M')) return num * 1000000;
    if (str.endsWith('K')) return num * 1000;
    return num || 0;
  };

  const detectChartType = (headers) => {
    const lower = headers.map(h => h.toLowerCase());
    const hasSpend = lower.some(h => h.includes('spend'));
    const hasGMV = lower.some(h => h.includes('gmv') || h.includes('revenue') || h.includes('sales'));
    
    if (hasSpend && hasGMV) {
      return {
        type: 'cpas',
        mappings: {
          month: headers.find(h => /month|date|period/i.test(h)) || headers[0],
          spend: headers.find(h => /spend/i.test(h)) || headers[1],
          gmv: headers.find(h => /gmv|revenue|sales/i.test(h)) || headers[2],
          roas: headers.find(h => /roas|roi/i.test(h))
        }
      };
    }
    return { type: 'bar', mappings: { xAxis: headers[0], values: headers.slice(1) } };
  };

  const handleFileUpload = async (file) => {
    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { sheetName, data, headers, isHorizontalLayout } = await parseExcelFile(file);
      if (data.length === 0) throw new Error('The uploaded file contains no data');

      let chartData, chartConfig;
      
      if (isHorizontalLayout) {
        // Data is already transformed in parseExcelFile
        chartData = data;
        chartConfig = { type: 'cpas', mappings: { month: 'month', spend: 'spend', gmv: 'gmv', roas: 'roas' } };
      } else {
        chartConfig = detectChartType(headers);
        chartData = chartConfig.type === 'cpas' 
          ? data.map(row => ({
              month: row[chartConfig.mappings.month],
              spend: parseFloat(row[chartConfig.mappings.spend]) || 0,
              gmv: parseFloat(row[chartConfig.mappings.gmv]) || 0,
              roas: chartConfig.mappings.roas 
                ? parseFloat(row[chartConfig.mappings.roas]) || 0
                : (parseFloat(row[chartConfig.mappings.gmv]) / parseFloat(row[chartConfig.mappings.spend])) || 0
            }))
          : data;
      }

      const newChart = {
        title: sheetName || file.name.replace(/\.[^/.]+$/, ''),
        chart_type: 'cpas',
        data: chartData,
        config: chartConfig,
        file_name: file.name
      };

      const { data: savedChart, error: saveError } = await supabase
        .from('charts')
        .insert([{ ...newChart, data: JSON.stringify(chartData), config: JSON.stringify(chartConfig) }])
        .select()
        .single();

      if (saveError) {
        console.warn('Supabase save error:', saveError);
        setCharts(prev => [{ ...newChart, id: Date.now() }, ...prev]);
      } else {
        setCharts(prev => [{ ...savedChart, data: chartData, config: chartConfig }, ...prev]);
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
    await supabase.from('charts').update({ title: newTitle }).eq('id', chartId);
    setCharts(prev => prev.map(c => c.id === chartId ? { ...c, title: newTitle } : c));
  };

  const handleDeleteChart = async (chartId) => {
    await supabase.from('charts').delete().eq('id', chartId);
    setCharts(prev => prev.filter(c => c.id !== chartId));
  };

  const renderChart = (chart, index) => {
    const colorScheme = index % 2 === 0 ? 'lazada' : 'shopee';
    
    if (chart.chart_type === 'cpas') {
      return <CPASChart data={chart.data} title={chart.title} colorScheme={colorScheme} />;
    }

    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chart.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey={Object.keys(chart.data[0])[0]} tick={{ fill: '#6b7280', fontSize: 12 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {Object.keys(chart.data[0]).slice(1).map((key, i) => (
            <Bar key={key} dataKey={key} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 4]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#111827' }}>Data Charts</h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#6b7280' }}>Upload Excel files to visualize your CPAS data</p>
          </div>
          <span style={{ fontSize: '14px', color: '#6b7280' }}>{charts.length} chart{charts.length !== 1 ? 's' : ''}</span>
        </div>
      </header>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 24px' }}>
        {/* Upload Section - Compact */}
        <section style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <FileUpload onUpload={handleFileUpload} isUploading={isUploading} />
          
          {error && (
            <div style={{ padding: '10px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}
          
          {successMessage && (
            <div style={{ padding: '10px 16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {successMessage}
            </div>
          )}
        </section>

        {charts.length > 0 ? (
          <section>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', marginBottom: '24px' }}>Your Charts</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: '32px' }}>
              {charts.map((chart, index) => (
                <ChartCard key={chart.id} title={chart.title} chartId={chart.id} onEditTitle={handleEditTitle} onDelete={handleDeleteChart}>
                  {renderChart(chart, index)}
                </ChartCard>
              ))}
            </div>
          </section>
        ) : (
          <section style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{ width: '96px', height: '96px', backgroundColor: '#f3f4f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <svg width="48" height="48" fill="none" stroke="#9ca3af" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            </div>
            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>No charts yet</h3>
            <p style={{ color: '#6b7280', margin: 0 }}>Upload an Excel file to create your first visualization</p>
          </section>
        )}
      </main>
    </div>
  );
};

export default DataCharts;