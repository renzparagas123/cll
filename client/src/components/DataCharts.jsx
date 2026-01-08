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

// Custom label component for Spend bars
const SpendLabel = ({ x, y, width, value, fill }) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  return (
    <text
      x={x - 3}
      y={y + 12}
      fill={fill || '#6baed6'}
      textAnchor="end"
      fontSize={8}
      fontStyle="italic"
    >
      {formatNumber(Number(value))}
    </text>
  );
};

// Custom label component for GMV bars
const GMVLabel = ({ x, y, width, value }) => {
  if (value === undefined || value === null || isNaN(value)) return null;
  return (
    <text
      x={x + width + 3}
      y={y + 12}
      fill="#1e3a5f"
      textAnchor="start"
      fontSize={8}
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
      y={y - 6}
      fill="#000000"
      textAnchor="middle"
      fontSize={9}
      fontWeight="500"
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
        borderRadius: '6px',
        padding: '8px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        fontSize: '12px'
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#333', marginBottom: '4px' }}>{label}</p>
        {payload.map((entry, index) => {
          const val = Number(entry.value);
          const displayVal = isNaN(val) ? '0' : (entry.name === 'ROAS' ? val.toFixed(2) : formatNumber(val));
          return (
            <p key={index} style={{ margin: '2px 0', color: entry.color }}>
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
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: '1px solid #eaeaea',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '12px 16px',
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
                padding: '6px 10px',
                border: '1px solid #3b82f6',
                borderRadius: '4px',
                fontSize: '13px',
                outline: 'none'
              }}
              autoFocus
            />
            <button onClick={handleSaveTitle} style={{ padding: '6px 12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Save</button>
            <button onClick={() => { setIsEditing(false); setEditedTitle(title); }} style={{ padding: '6px 12px', backgroundColor: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
          </div>
        ) : (
          <>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{title}</h3>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button onClick={() => setIsEditing(true)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#9ca3af' }} title="Edit title">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button onClick={() => onDelete && onDelete(chartId)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#9ca3af' }} title="Delete chart">
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
    </div>
  );
};

// Month Filter Component - Compact inline version
const MonthFilter = ({ months, selectedMonths, onChange }) => {
  const toggleMonth = (month) => {
    if (selectedMonths.includes(month)) {
      if (selectedMonths.length > 1) {
        onChange(selectedMonths.filter(m => m !== month));
      }
    } else {
      onChange([...selectedMonths, month]);
    }
  };

  const selectAll = () => onChange([...months]);
  const selectQ1 = () => onChange(months.filter(m => ['January', 'February', 'March'].includes(m)));
  const selectQ2 = () => onChange(months.filter(m => ['April', 'May', 'June'].includes(m)));
  const selectQ3 = () => onChange(months.filter(m => ['July', 'August', 'September'].includes(m)));
  const selectQ4 = () => onChange(months.filter(m => ['October', 'November', 'December'].includes(m)));

  const btnStyle = (active) => ({
    padding: '3px 8px',
    fontSize: '10px',
    border: '1px solid',
    borderColor: active ? '#3b82f6' : '#e5e7eb',
    borderRadius: '4px',
    backgroundColor: active ? '#3b82f6' : '#fff',
    color: active ? '#fff' : '#374151',
    cursor: 'pointer',
    transition: 'all 0.15s'
  });

  const monthBtnStyle = (active) => ({
    padding: '2px 6px',
    fontSize: '9px',
    border: '1px solid',
    borderColor: active ? '#3b82f6' : '#e5e7eb',
    borderRadius: '3px',
    backgroundColor: active ? '#eff6ff' : '#fff',
    color: active ? '#1d4ed8' : '#6b7280',
    cursor: 'pointer',
    transition: 'all 0.15s'
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
      {/* Quick filters */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={selectAll} style={btnStyle(selectedMonths.length === months.length)}>All</button>
        <button onClick={selectQ1} style={btnStyle(false)}>Q1</button>
        <button onClick={selectQ2} style={btnStyle(false)}>Q2</button>
        <button onClick={selectQ3} style={btnStyle(false)}>Q3</button>
        <button onClick={selectQ4} style={btnStyle(false)}>Q4</button>
      </div>
      
      {/* Divider */}
      <div style={{ width: '1px', height: '20px', backgroundColor: '#e5e7eb' }} />
      
      {/* Individual month toggles */}
      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
        {months.map(month => (
          <button
            key={month}
            onClick={() => toggleMonth(month)}
            style={monthBtnStyle(selectedMonths.includes(month))}
          >
            {month.slice(0, 3)}
          </button>
        ))}
      </div>
    </div>
  );
};

// CPAS Chart Component
const CPASChart = ({ data, title, colorScheme = 'lazada' }) => {
  const allMonths = data.map(d => d.month);
  const [selectedMonths, setSelectedMonths] = useState(allMonths);
  
  const filteredData = data.filter(d => selectedMonths.includes(d.month));
  
  const colors = colorScheme === 'lazada' 
    ? { spend: '#b8d4e8', gmv: '#1e3a5f', spendLabel: '#6baed6' }
    : { spend: '#ffd699', gmv: '#ff8c42', spendLabel: '#ff8c42' };

  const maxGMV = Math.max(...filteredData.map(d => Number(d.gmv) || 0));
  const maxROAS = Math.max(...filteredData.map(d => Number(d.roas) || 0));
  const yAxisMax = Math.ceil(maxGMV / 1000000) * 1000000 + 1500000;
  const roasAxisMax = Math.ceil(maxROAS / 5) * 5 + 5;

  return (
    <div>
      <MonthFilter months={allMonths} selectedMonths={selectedMonths} onChange={setSelectedMonths} />
      
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart 
          data={filteredData} 
          margin={{ top: 20, right: 45, left: 40, bottom: 5 }}
          barGap={1}
          barCategoryGap="12%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
          <XAxis 
            dataKey="month" 
            tick={{ fill: '#333', fontSize: 10 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
            interval={0}
          />
          <YAxis 
            yAxisId="left"
            tick={{ fill: '#333', fontSize: 9 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
            tickFormatter={formatYAxis}
            domain={[0, yAxisMax]}
            width={35}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#333', fontSize: 9 }}
            axisLine={{ stroke: '#ccc' }}
            tickLine={false}
            domain={[0, roasAxisMax]}
            tickFormatter={(v) => isNaN(Number(v)) ? '0' : Number(v).toFixed(2)}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top"
            align="center"
            iconType="square"
            iconSize={8}
            wrapperStyle={{ paddingBottom: '8px', fontSize: '10px' }}
          />
          
          <Bar yAxisId="left" dataKey="spend" name="CPAS Spend" fill={colors.spend} maxBarSize={32}>
            <LabelList dataKey="spend" content={(props) => <SpendLabel {...props} fill={colors.spendLabel} />} />
          </Bar>
          
          <Bar yAxisId="left" dataKey="gmv" name="CPAS GMV" fill={colors.gmv} maxBarSize={32}>
            <LabelList dataKey="gmv" content={<GMVLabel />} />
          </Bar>
          
          <Line yAxisId="right" type="linear" dataKey="roas" name="ROAS" stroke="#000" strokeWidth={1.5} dot={{ fill: '#000', r: 3 }}>
            <LabelList dataKey="roas" content={<ROASLabel />} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
      
      <div style={{ textAlign: 'center', marginTop: '4px' }}>
        <span style={{ fontSize: '11px', color: '#666', fontWeight: 500 }}>{title}</span>
      </div>
    </div>
  );
};

// File Upload Component - Compact
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
        gap: '8px',
        border: `1px solid ${dragActive ? '#3b82f6' : '#e5e7eb'}`,
        borderRadius: '6px',
        padding: '8px 14px',
        backgroundColor: dragActive ? '#eff6ff' : '#fff',
        cursor: 'pointer',
        opacity: isUploading ? 0.6 : 1,
        transition: 'all 0.2s'
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
        <div style={{ width: '16px', height: '16px', border: '2px solid #dbeafe', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      ) : (
        <svg width="16" height="16" fill="none" stroke="#3b82f6" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      )}
      
      <span style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
        {isUploading ? 'Uploading...' : 'Upload Excel'}
      </span>
      <span style={{ fontSize: '11px', color: '#9ca3af' }}>.xlsx, .xls, .csv</span>
      
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
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          const firstCol = rawData.map(row => row[0]?.toString().toLowerCase() || '');
          const isHorizontalLayout = firstCol.some(cell => 
            cell.includes('spend') || cell.includes('gmv') || cell.includes('roas')
          );
          
          let jsonData, headers;
          
          if (isHorizontalLayout) {
            const months = rawData[0].slice(1);
            const transformedData = [];
            
            let spendRow, gmvRow, roasRow;
            rawData.forEach((row, index) => {
              const label = row[0]?.toString().toLowerCase() || '';
              if (label.includes('spend')) spendRow = index;
              else if (label.includes('gmv')) gmvRow = index;
              else if (label.includes('roas')) roasRow = index;
            });
            
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

      setSuccessMessage(`Uploaded "${file.name}"`);
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
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chart.data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey={Object.keys(chart.data[0])[0]} tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
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
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Compact Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <FileUpload onUpload={handleFileUpload} isUploading={isUploading} />
          
          {error && (
            <div style={{ padding: '6px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
              {error}
            </div>
          )}
          
          {successMessage && (
            <div style={{ padding: '6px 12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              {successMessage}
            </div>
          )}
        </div>
        
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          {charts.length} chart{charts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Charts Grid */}
      {charts.length > 0 ? (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', 
          gap: '16px' 
        }}>
          {charts.map((chart, index) => (
            <ChartCard 
              key={chart.id} 
              title={chart.title} 
              chartId={chart.id} 
              onEditTitle={handleEditTitle} 
              onDelete={handleDeleteChart}
            >
              {renderChart(chart, index)}
            </ChartCard>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '48px 20px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px dashed #e5e7eb' }}>
          <svg width="40" height="40" fill="none" stroke="#9ca3af" viewBox="0 0 24 24" style={{ margin: '0 auto 12px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p style={{ fontSize: '14px', fontWeight: 500, color: '#374151', margin: '0 0 4px' }}>No charts yet</p>
          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>Upload an Excel file to get started</p>
        </div>
      )}
    </div>
  );
};

export default DataCharts;