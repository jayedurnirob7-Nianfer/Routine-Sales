        <div className="card p-6 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><span className="text-lg">🌙</span> Night Shift Tracker</h3>
          </div>
          {nightProgress && nightProgress.totalNights > 0 ? (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-3xl font-black text-purple-600 tracking-tight">{nightProgress.completedNights} <span className="text-lg font-medium text-gray-400 tracking-normal">/ {nightProgress.totalNights}</span></div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">Completed Nights</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-amber-500">{nightProgress.remainingNights}</div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">Remaining</div>
                </div>
              </div>
              <div className="relative pt-1">
                <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-purple-100 dark:bg-gray-800 inset-shadow-sm">
                  <div style={{ width: `${(nightProgress.completedNights / nightProgress.totalNights) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full"></div>
                </div>
              </div>
              <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg text-center font-medium">
                Block: {nightProgress.rangeFrom.toLocaleDateString()} — {nightProgress.rangeTo.toLocaleDateString()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 min-h-[120px]">
              <span className="text-gray-400 text-sm font-medium italic">Not assigned</span>
            </div>
          )}
        </div>
