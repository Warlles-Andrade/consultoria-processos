import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, FileText, Clock, CheckCircle, Briefcase, Users, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { statusOptions as globalStatusOptions, getStatusColor } from '@/data/mockData';

function useDarkMode() {
  const check = () => document.documentElement.classList.contains('dark');
  const [isDark, setIsDark] = useState(check);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(check()));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const Dashboard = ({ processes, responsaveis, projetos = [], onNavigateToStatus }) => {
  const isDark = useDarkMode();
  const totalProcesses = processes.length;
  
  const statusCounts = globalStatusOptions.reduce((acc, status) => {
    acc[status] = processes.filter(p => p.status === status).length;
    return acc;
  }, {});

  const statusData = globalStatusOptions.map(status => ({
    name: status,
    value: statusCounts[status],
    color: (() => {
        const colorClass = getStatusColor(status);
        if (colorClass.includes('gray')) return '#A0AEC0';
        if (colorClass.includes('blue')) return '#60A5FA';
        if (colorClass.includes('orange')) return '#FB923C';
        if (colorClass.includes('green')) return '#4ADE80';
        return '#FBBF24';
    })()
  })).filter(item => item.value > 0);

  // Gráfico de tarefas por responsável
  const tasksByResponsavel = responsaveis.map(resp => ({
    name: resp.name,
    tarefas: processes.filter(p => p.responsavel === resp.name).length
  })).filter(item => item.tarefas > 0);

  const metrics = [
    { title: 'Total de Processos', value: totalProcesses,                icon: Briefcase,   accent: '#0ea5e9' },
    { title: 'Não Iniciados',      value: statusCounts['Não Iniciado'],  icon: FileText,    accent: '#94a3b8' },
    { title: 'Em Andamento',       value: statusCounts['Em Andamento'],  icon: Clock,       accent: '#3b82f6' },
    { title: 'Paralisados',        value: statusCounts['Paralisado'],    icon: Pause,       accent: '#f97316' },
    { title: 'Concluídos',         value: statusCounts['Concluído'],     icon: CheckCircle, accent: '#22c55e' },
  ];

  const handleCardClick = (status) => {
    if (onNavigateToStatus) onNavigateToStatus(status === 'Total de Processos' ? null : status);
  };

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 px-2 sm:px-0">
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card
              className="glass-card border-white/60 rounded-xl sm:rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer group overflow-hidden"
              style={{ borderLeft: `4px solid ${metric.accent}` }}
              onClick={() => handleCardClick(metric.title.replace('Não Iniciados', 'Não Iniciado').replace('Paralisados', 'Paralisado').replace('Concluídos', 'Concluído'))}
            >
              <CardContent className="p-3 sm:p-4 md:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div
                    className="p-2 sm:p-3 rounded-xl shadow-md group-hover:scale-110 transition-transform duration-300"
                    style={{ backgroundColor: `${metric.accent}20` }}
                  >
                    <metric.icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" style={{ color: metric.accent }} />
                  </div>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-500 mb-1">{metric.title}</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800">{metric.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8">
        <motion.div 
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            className="hover-lift"
        >
          <Card className="glass-card border-white/60 rounded-2xl h-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-teal-50/50 pointer-events-none"></div>
            <CardHeader className="pb-2 px-4 sm:px-6 relative">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl font-bold text-slate-800">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 shadow-md">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <span className="truncate">Distribuição por Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 px-2 sm:px-6 relative">
              <ResponsiveContainer width="100%" height={280} className="sm:hidden">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    fill="#8884d8"
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: isDark ? '#232326' : '#fff', border: '1px solid #3f3f46', borderRadius: 8, color: isDark ? '#f4f4f5' : '#1e293b' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: isDark ? '#a1a1aa' : undefined }}
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={350} className="hidden sm:block">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    fill="#8884d8"
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, name, value }) => {
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + (radius + 20) * Math.cos(-midAngle * (Math.PI / 180));
                      const y = cy + (radius + 20) * Math.sin(-midAngle * (Math.PI / 180));
                      if (value === 0) return null;
                      const dark = document.documentElement.classList.contains('dark');
                      return (
                        <text x={x} y={y} fill={dark ? '#a1a1aa' : '#4A5568'} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-medium">
                          {`${name} (${(percent * 100).toFixed(0)}%)`}
                        </text>
                      );
                    }}
                  >
                    {statusData.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={entry.color} stroke={entry.color} className="focus:outline-none"/>
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} processos`, name]}
                    contentStyle={{ background: isDark ? '#232326' : '#fff', border: '1px solid #3f3f46', borderRadius: 8, color: isDark ? '#f4f4f5' : '#1e293b' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '15px', color: isDark ? '#a1a1aa' : undefined }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            whileHover={{ scale: 1.02 }}
            className="hover-lift"
        >
          <Card className="glass-card border-white/60 rounded-2xl h-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-50/50 via-transparent to-amber-50/50 pointer-events-none"></div>
            <CardHeader className="pb-2 relative">
              <CardTitle className="flex items-center gap-2 text-xl font-bold text-slate-800">
                <div className="p-2 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 shadow-md">
                  <Users className="h-5 w-5 text-white" />
                </div>
                Tarefas por Responsável
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 relative">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={tasksByResponsavel} margin={{ top: 5, right: 20, left: 30, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/>
                  <XAxis 
                    dataKey="name" 
                    tick={{fill: '#4A5568', fontSize: 12}}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{fill: '#4A5568', fontSize: 13}} domain={[0, 'dataMax + 1']}/>
                  <Tooltip 
                    formatter={(value) => [`${value} tarefas`, "Quantidade"]}
                    labelStyle={{color: '#1a202c', fontWeight: 'bold'}}
                    itemStyle={{color: '#8b5cf6'}}
                    contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '0.5rem', borderColor: '#e2e8f0'}}
                  />
                  <Legend wrapperStyle={{fontSize: '13px'}}/>
                  <Bar 
                    dataKey="tarefas" 
                    name="Tarefas"
                    fill="#8b5cf6" 
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
