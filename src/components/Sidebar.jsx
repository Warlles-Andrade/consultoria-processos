import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Table,
  Kanban,
  GanttChartSquare,
  ListChecks,
  Building,
  Users,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  UserCircle2,
  Shield,
  FolderKanban,
  Repeat,
  Landmark,
  Building2,
  FileCheck2,
  Receipt,
  Gavel,
  AlarmClock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SettingsMenu from '@/components/SettingsMenu';

const Sidebar = ({
  activeTab,
  setActiveTab,
  userProfile,
  onLogout,
  isCollapsed,
  setIsCollapsed,
  onChangePasswordRequest,
  userId,
  canSeeGantt = false,
  canSeeRecorrentes = false,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, gradient: 'from-blue-500 to-teal-500' },
    { id: 'table', label: 'Tabela', icon: Table, gradient: 'from-blue-500 to-cyan-500' },
    { id: 'kanban', label: 'Kanban', icon: Kanban, gradient: 'from-pink-500 to-rose-500' },
    ...(canSeeGantt ? [{ id: 'gantt', label: 'Cronograma', icon: GanttChartSquare, gradient: 'from-teal-500 to-emerald-500' }] : []),
    ...(canSeeRecorrentes ? [{ id: 'recorrentes', label: 'Tarefas Recorrentes', icon: Repeat, gradient: 'from-purple-500 to-indigo-500' }] : []),
  ];

  // Módulo fiscal/jurídico — créditos, e-CredAc, PER/DCOMP e contencioso
  const fiscalItems = [
    { id: 'creditos', label: 'Créditos', icon: Landmark, gradient: 'from-indigo-500 to-violet-600' },
    { id: 'habilitacoes', label: 'e-CredAc', icon: FileCheck2, gradient: 'from-teal-500 to-emerald-600' },
    { id: 'perdcomps', label: 'PER/DCOMP', icon: Receipt, gradient: 'from-blue-500 to-cyan-600' },
    { id: 'contencioso', label: 'Contencioso', icon: Gavel, gradient: 'from-amber-500 to-orange-600' },
    { id: 'prazos', label: 'Prazos', icon: AlarmClock, gradient: 'from-rose-500 to-red-600' },
  ];

  const configItems = [];
  const isAdmin = userProfile?.grupo === 'adm';

  configItems.push({
    id: 'contribuintes',
    label: 'Contribuintes',
    icon: Building2
  });

  if (isAdmin) {
    configItems.push({
      id: 'grupos',
      label: 'Clientes',
      icon: Layers
    });
  }
  // Projetos: admin vê todos; membro vê/cria os próprios
  configItems.push({
    id: 'projetos',
    label: 'Projetos',
    icon: FolderKanban
  });
  if (isAdmin) {
    configItems.push({
      id: 'usuarios',
      label: 'Usuários',
      icon: Users
    });
  }

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleMobileSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={toggleMobileSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-3 glass-card rounded-xl shadow-lg"
      >
        {isMobileOpen ? <X className="h-6 w-6 text-gray-700" /> : <Menu className="h-6 w-6 text-gray-700" />}
      </motion.button>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleMobileSidebar}
            className="lg:hidden fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? '80px' : '280px',
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={`
          fixed left-0 top-0 h-screen glass-card border-r border-white/60 z-40 flex flex-col shadow-2xl
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ width: isCollapsed ? '80px' : '280px' }}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/40">
          <motion.div 
            className="flex items-center justify-between"
            layout
          >
            <AnimatePresence mode="wait">
              {!isCollapsed ? (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3"
                >
                  <img src="/img/logo.png" alt="Workive" className="h-9 w-9 object-contain" />
                  <div>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-teal-500 bg-clip-text text-transparent">
                      Workive
                    </h1>
                    <p className="text-xs text-gray-600 font-medium">Sistema de Gestão</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="w-full flex justify-center"
                >
                  <img src="/img/logo.png" alt="Workive" className="h-9 w-9 object-contain" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Collapse Button - Desktop only */}
            {!isCollapsed && (
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex p-2 rounded-lg hover:bg-white/60 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
            )}
            {isCollapsed && (
              <button
                onClick={toggleSidebar}
                className="hidden lg:flex absolute right-2 top-6 p-2 rounded-lg hover:bg-white/60 transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-600" />
              </button>
            )}
          </motion.div>
        </div>

        {/* User Info Section */}
        <div className="px-4 py-3 border-b border-white/40">
          {isCollapsed ? (
            <div className="flex justify-center">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-teal-100">
                <UserCircle2 className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-100 to-teal-100">
                  <UserCircle2 className="h-6 w-6 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {userProfile?.nome || 'Usuário'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {userProfile?.grupo === 'adm' && (
                      <Shield className="h-3 w-3 text-red-500" />
                    )}
                    <p className="text-xs text-gray-600 font-medium capitalize">
                      {userProfile?.grupo === 'adm' ? 'Administrador' : userProfile?.grupo || 'Grupo'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Navegação
              </p>
            )}
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) {
                      setIsMobileOpen(false);
                    }
                  }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  title={isCollapsed ? item.label : ''}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative
                    ${isActive 
                      ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg` 
                      : 'text-gray-700 hover:bg-white/60'
                    }
                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="font-semibold text-sm whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Fiscal / Jurídico */}
          <div className="pt-4 space-y-1">
            {!isCollapsed && (
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Fiscal / Jurídico
              </p>
            )}
            {fiscalItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) {
                      setIsMobileOpen(false);
                    }
                  }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  title={isCollapsed ? item.label : ''}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 relative
                    ${isActive
                      ? `bg-gradient-to-r ${item.gradient} text-white shadow-lg`
                      : 'text-gray-700 hover:bg-white/60'
                    }
                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="font-semibold text-sm whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          {/* Configuration Section */}
          <div className="pt-4 space-y-1">
            {!isCollapsed && (
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Configurações
              </p>
            )}
            {configItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              
              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    // Todos os itens agora mudam de aba
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) {
                      setIsMobileOpen(false);
                    }
                  }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  title={isCollapsed ? item.label : ''}
                  className={`
                    w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
                    ${isActive 
                      ? 'bg-gradient-to-r from-blue-600 to-teal-500 text-white shadow-lg'
                      : 'text-gray-700 hover:bg-white/60'
                    }
                    ${isCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className={`text-sm whitespace-nowrap ${isActive ? 'font-semibold' : 'font-medium'}`}
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </nav>

        {/* Configurações */}
        <SettingsMenu
          isCollapsed={isCollapsed}
          onChangePasswordRequest={onChangePasswordRequest}
          userId={userId}
        />

          {/* Logout Button */}
        <div className="p-4 border-t border-white/40">
          <motion.button
            onClick={onLogout}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title={isCollapsed ? 'Sair' : ''}
            className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl 
              bg-gradient-to-r from-red-500 to-rose-600 text-white 
              shadow-lg hover:shadow-xl transition-all duration-200
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-semibold text-sm whitespace-nowrap"
                >
                  Sair
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;
