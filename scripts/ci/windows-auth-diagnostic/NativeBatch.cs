using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace OcxWindowsAuthDiagnostic
{
    public static class NativeBatch
    {
        private const uint Timeout = 258, Failed = 0xffffffff, BatchWaitMs = 480000;
        private const uint KillOnJobClose = 0x2000, UseStdHandles = 0x100;
        private const uint CreateSuspended = 0x4, CreateNoWindow = 0x08000000, ExtendedStartupInfoPresent = 0x80000;
        private const string Arguments = " test --isolate --timeout 60000" +
            " tests/server/server-management-auth.test.ts tests/server/sidebar-star-state.test.ts" +
            " tests/server/startup-action-control-elevation.test.ts tests/service/autostart-health.test.ts" +
            " tests/service/service-auth-qualified-localhost.test.ts tests/service/service-child-ownership.test.ts";
        [StructLayout(LayoutKind.Sequential)]
        private struct BasicLimits
        {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
        [StructLayout(LayoutKind.Sequential)]
        private struct ExtendedLimits
        {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct StartupInfo
        {
            public uint Size;
            public IntPtr Reserved, Desktop, Title;
            public uint X, Y, XSize, YSize, XChars, YChars, Fill, Flags;
            public ushort ShowWindow, ReservedSize;
            public IntPtr ReservedBytes, Input, Output, Error;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct StartupInfoEx { public StartupInfo Startup; public IntPtr AttributeList; }
        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint length);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern bool CreateProcessW(string application, StringBuilder commandLine, IntPtr processAttributes,
            IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory,
            ref StartupInfoEx startup, out ProcessInfo process);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value,
            IntPtr size, IntPtr previousValue, IntPtr returnSize);
        [DllImport("kernel32.dll")]
        private static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr GetStdHandle(int kind);
        [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess,
            out IntPtr target, uint access, bool inherit, uint options);

        private static void Check(bool success)
        {
            if (!success) { int error = Marshal.GetLastWin32Error(); throw new Win32Exception(error == 0 ? 31 : error); }
        }
        private static void RecordError(Dictionary<string, object> result, int error)
        {
            if ((int)result["nativeError"] == 0) result["nativeError"] = error == 0 ? 31 : error;
        }
        private static void Close(IntPtr handle, Dictionary<string, object> result)
        {
            if (handle != IntPtr.Zero && !CloseHandle(handle)) RecordError(result, Marshal.GetLastWin32Error());
        }
        private static IntPtr StandardHandle(int kind)
        {
            IntPtr source = GetStdHandle(kind), duplicate;
            if (source == IntPtr.Zero || source == new IntPtr(-1)) throw new Win32Exception(6);
            IntPtr current = GetCurrentProcess();
            Check(DuplicateHandle(current, source, current, out duplicate, 0, true, 2));
            return duplicate;
        }
        private static string LocalPath(string value)
        {
            if (String.IsNullOrEmpty(value) || value.Length < 3 || !Char.IsLetter(value[0]) || value[1] != ':' ||
                (value[2] != '\\' && value[2] != '/') || value.IndexOf('"') >= 0) throw new ArgumentException();
            foreach (char c in value) if (c < 32) throw new ArgumentException();
            return Path.GetFullPath(value);
        }
        public static Dictionary<string, object> Run(string bunPath, string repoDir)
        {
            Dictionary<string, object> result = new Dictionary<string, object> {
                { "testStarted", false }, { "testExit", null }, { "batchTimeout", false },
                { "jobAssigned", false }, { "descendantsTerminated", false }, { "nativeError", 0 }
            };
            IntPtr job = IntPtr.Zero, handleList = IntPtr.Zero;
            bool attributesInitialized = false;
            StartupInfoEx startup = new StartupInfoEx();
            ProcessInfo process = new ProcessInfo();
            try
            {
                bunPath = LocalPath(bunPath); repoDir = LocalPath(repoDir);
                if (!File.Exists(bunPath) || !Directory.Exists(repoDir)) throw new Win32Exception(2);
                job = CreateJobObjectW(IntPtr.Zero, null); // NULL attributes: non-inheritable, unnamed job.
                Check(job != IntPtr.Zero);
                ExtendedLimits limits = new ExtendedLimits(); limits.Basic.Flags = KillOnJobClose;
                Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
                startup.Startup.Size = (uint)Marshal.SizeOf(typeof(StartupInfoEx)); startup.Startup.Flags = UseStdHandles;
                startup.Startup.Input = StandardHandle(-10);
                startup.Startup.Output = StandardHandle(-11);
                startup.Startup.Error = StandardHandle(-12);
                IntPtr attributeBytes = IntPtr.Zero;
                bool sized = InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes);
                int sizeError = Marshal.GetLastWin32Error();
                if (sized || sizeError != 122) throw new Win32Exception(sizeError == 0 ? 31 : sizeError);
                if (attributeBytes.ToInt64() <= 0 || attributeBytes.ToInt64() > 65536) throw new Win32Exception(87);
                startup.AttributeList = Marshal.AllocHGlobal(attributeBytes);
                Check(InitializeProcThreadAttributeList(startup.AttributeList, 1, 0, ref attributeBytes));
                attributesInitialized = true;
                handleList = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handleList, 0, startup.Startup.Input);
                Marshal.WriteIntPtr(handleList, IntPtr.Size, startup.Startup.Output);
                Marshal.WriteIntPtr(handleList, IntPtr.Size * 2, startup.Startup.Error);
                // PROC_THREAD_ATTRIBUTE_HANDLE_LIST: only these inheritable duplicates may cross.
                Check(UpdateProcThreadAttribute(startup.AttributeList, 0, new IntPtr(0x20002), handleList,
                    new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
                // Exact application, fixed argv, inherited environment; suspend before any Bun instruction executes.
                Check(CreateProcessW(bunPath, new StringBuilder("\"" + bunPath + "\"" + Arguments), IntPtr.Zero,
                    IntPtr.Zero, true, CreateSuspended | CreateNoWindow | ExtendedStartupInfoPresent,
                    IntPtr.Zero, repoDir, ref startup, out process));
                Check(AssignProcessToJobObject(job, process.Process));
                result["jobAssigned"] = true;
                Stopwatch deadline = Stopwatch.StartNew();
                Check(ResumeThread(process.Thread) != Failed); result["testStarted"] = true;
                uint remaining = (uint)Math.Max(0L, (long)BatchWaitMs - deadline.ElapsedMilliseconds);
                uint wait = WaitForSingleObject(process.Process, remaining);
                Check(wait != Failed);
                if (wait == Timeout) result["batchTimeout"] = true;
                else if (wait == 0)
                {
                    uint code; Check(GetExitCodeProcess(process.Process, out code));
                    result["testExit"] = unchecked((int)code); // Preserve the original DWORD bit pattern.
                }
                else throw new Win32Exception(31);
            }
            catch (Win32Exception error) { RecordError(result, error.NativeErrorCode); }
            catch (Exception error) { RecordError(result, error.HResult); }
            finally
            {
                if ((bool)result["jobAssigned"])
                {
                    // Also runs after the leader exits: descendants still belong to this job.
                    bool terminated = TerminateJobObject(job, (bool)result["batchTimeout"] ? 124U : 125U);
                    result["descendantsTerminated"] = terminated;
                    if (!terminated) RecordError(result, Marshal.GetLastWin32Error());
                }
                else if (process.Process != IntPtr.Zero && !TerminateProcess(process.Process, 125))
                    RecordError(result, Marshal.GetLastWin32Error()); // Assignment failure: kill the suspended owned child.
                Close(job, result); // KILL_ON_JOB_CLOSE also covers termination-request failure.
                if (process.Process != IntPtr.Zero)
                {
                    uint wait = WaitForSingleObject(process.Process, 5000);
                    if (wait == Failed) RecordError(result, Marshal.GetLastWin32Error());
                    else if (wait != 0) RecordError(result, 1460);
                }
                Close(process.Thread, result); Close(process.Process, result);
                if (attributesInitialized) DeleteProcThreadAttributeList(startup.AttributeList);
                if (startup.AttributeList != IntPtr.Zero) Marshal.FreeHGlobal(startup.AttributeList);
                if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
                Close(startup.Startup.Input, result); Close(startup.Startup.Output, result); Close(startup.Startup.Error, result);
            }
            return result;
        }
    }
}
