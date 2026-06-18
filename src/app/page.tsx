  function ShiftCard({ shift, employees, offEmployees, onLeaveEmployees = [], date }: { shift: ShiftType; employees: Employee[]; offEmployees: Employee[]; onLeaveEmployees?: Employee[]; date: string; }) {
    const info = SHIFT_INFO[shift];
    return (
      <div className="card overflow-visible h-full flex flex-col">
        <div className={`bg-gradient-to-r ${shiftColors[shift]} p-5 text-white rounded-t-2xl`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold opacity-95 tracking-wide flex items-center gap-2">
                <span className="text-2xl">{shiftIcons[shift]}</span> {info.label} Shift
              </div>
              <div className="text-sm opacity-80 mt-1 font-medium">{info.time}</div>
            </div>
            <div className="text-5xl font-black opacity-95">{employees.length}</div>
          </div>
        </div>
        <div className="p-4 flex flex-col flex-1">
          {employees.length === 0 ? <p className="text-gray-400 text-sm">No one assigned</p> : <div className="space-y-1">{employees.map(emp => <EmployeeRow key={emp.id} emp={emp} date={date} shiftType={shift} />)}</div>}
          
          {/* --- Bottom Alignment Wrapper --- */}
          <div className="mt-auto pt-4 flex flex-col gap-3">
            {offEmployees.length > 0 && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/20 border border-gray-100 dark:border-gray-700/50 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">🛌 {getOffDayLabel(date)}</div>
                {offEmployees.map(emp => <EmployeeRow key={emp.id} emp={emp} muted date={date} />)}
              </div>
            )}
            
            {onLeaveEmployees.length > 0 && (
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 border border-amber-100 dark:border-amber-900/30 space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500 font-bold">✈️ On Leave</div>
                {onLeaveEmployees.map(emp => <EmployeeRow key={emp.id} emp={emp} muted date={date} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
