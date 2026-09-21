import React, { useState } from 'react';
import axios from 'axios';
import { 
  FileSpreadsheet, 
  CloudSun, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  ArrowRightLeft
} from 'lucide-react';

const API_URL = "http://localhost:8000";

const App = () => {
  const [activeTab, setActiveTab] = useState('excel');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

  const notify = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ArrowRightLeft className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-xl tracking-tight">FastWork</h1>
          </div>
          
          <nav className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setActiveTab('excel')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'excel' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Excel Unpivoter
              </div>
            </button>
            <button 
              onClick={() => setActiveTab('weather')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'weather' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <CloudSun className="w-4 h-4" />
                Weather Map
              </div>
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        {status.message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
            status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {status.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <p className="text-sm font-medium">{status.message}</p>
          </div>
        )}

        {activeTab === 'excel' ? <ExcelTool notify={notify} setIsLoading={setIsLoading} isLoading={isLoading} /> : <WeatherTool notify={notify} setIsLoading={setIsLoading} isLoading={isLoading} />}
      </main>
    </div>
  );
};

const ExcelTool = ({ notify, setIsLoading, isLoading }) => {
  const [file, setFile] = useState(null);

  const handleTransform = async () => {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_URL}/transform`, formData, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'transformed_data.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      notify('success', 'Transformation complete! File downloaded.');
    } catch (err) {
      notify('error', 'Failed to process file. Please check backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Excel Matrix Unpivoter</h2>
        <p className="text-slate-500">Convert cross-tabulated Excel workbooks into flat relational tables.</p>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div 
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
            file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
          }`}
        >
          <input 
            type="file" 
            id="excel-upload" 
            className="hidden" 
            accept=".xlsx,.xls" 
            onChange={(e) => setFile(e.target.files[0])}
          />
          <label htmlFor="excel-upload" className="cursor-pointer flex flex-col items-center gap-4">
            <div className="p-4 bg-slate-100 rounded-full text-slate-600">
              <Upload className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-slate-900">
                {file ? file.name : 'Click to upload Excel file'}
              </p>
              <p className="text-xs text-slate-500">XLSX or XLS (Max 50MB)</p>
            </div>
          </label>
        </div>

        <button 
          onClick={handleTransform}
          disabled={!file || isLoading}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          {isLoading ? 'Processing...' : 'Transform & Download'}
        </button>
      </div>
    </div>
  );
};

const WeatherTool = ({ notify, setIsLoading, isLoading }) => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [month, setMonth] = useState('JANUARY');
  const [year, setYear] = useState('2026');

  const months = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setResult(null);
  };

  const handleTranslate = async () => {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target_month', month);
    formData.append('target_year', year);

    try {
      const response = await axios.post(`${API_URL}/translate-map`, formData, {
        responseType: 'blob',
      });
      setResult(URL.createObjectURL(response.data));
      notify('success', 'Map translated successfully!');
    } catch (err) {
      notify('error', 'Translation failed. Please check your input and backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Weather Map Translator</h2>
        <p className="text-slate-500">Translate precipitation analysis map legends to English.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Map</label>
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Target Month</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Target Year</label>
              <input 
                type="text" 
                value={year} 
                onChange={(e) => setYear(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <button 
            onClick={handleTranslate}
            disabled={!file || isLoading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudSun className="w-5 h-5" />}
            {isLoading ? 'Processing...' : 'Translate Map'}
          </button>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!preview ? (
            <div className="aspect-video bg-slate-100 rounded-3xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 italic">
              Upload an image to see preview
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Original</p>
                <img src={preview} alt="Original" className="w-full rounded-2xl shadow-sm border border-slate-200" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Result</p>
                {result ? (
                  <div className="space-y-4">
                    <img src={result} alt="Result" className="w-full rounded-2xl shadow-sm border border-slate-200" />
                    <a 
                      href={result} 
                      download={`map_${month.toLowerCase()}_${year}.jpg`}
                      className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Download Result
                    </a>
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 italic text-center px-4">
                    {isLoading ? 'Translating...' : 'Click translate to generate result'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
