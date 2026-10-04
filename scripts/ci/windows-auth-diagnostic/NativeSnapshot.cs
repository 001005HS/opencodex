using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace OcxWindowsAuthDiagnostic
{
    // Event callbacks run on CLR threads, never a PowerShell script-block runspace.
    public sealed class RequestSignal : IDisposable
    {
        private readonly AutoResetEvent signal = new AutoResetEvent(false);
        private readonly FileSystemWatcher watcher;
        private int error;

        public RequestSignal(string directory)
        {
            watcher = new FileSystemWatcher(directory, "request.json");
            watcher.NotifyFilter = NotifyFilters.FileName;
            watcher.Created += OnCreated;
            watcher.Renamed += OnRenamed;
            watcher.Error += OnError;
            watcher.EnableRaisingEvents = true;
        }
        private void OnCreated(object sender, FileSystemEventArgs args) { signal.Set(); }
        private void OnRenamed(object sender, RenamedEventArgs args) { signal.Set(); }
        private void OnError(object sender, ErrorEventArgs args)
        {
            Interlocked.Exchange(ref error, args.GetException().HResult);
            signal.Set();
        }
        public void Wait(int milliseconds)
        {
            signal.WaitOne(milliseconds);
            int status = Interlocked.CompareExchange(ref error, 0, 0);
            if (status != 0) throw new COMException(null, status);
        }
        public void Dispose()
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
            // Already queued callbacks can still Set; process lifetime owns this event.
        }
    }

    public static class NativeSnapshot
    {
        private const int MaxEntries = 64, MaxAces = 16, MaxOwners = 16;
        private const uint ShareAll = 7, OpenExisting = 3;
        private const uint NoFollowBackup = 0x02200000, DeleteAccess = 0x00010000;
        private const uint ReadAttributes = 0x80, Reparse = 0x400, DirectoryAttribute = 0x10;
        private const int MoreData = 234;

        [StructLayout(LayoutKind.Sequential)]
        private struct FileInfo
        {
            public uint Attributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct UniqueProcess
        {
            public uint Id;
            public System.Runtime.InteropServices.ComTypes.FILETIME Started;
        }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct ProcessInfo
        {
            public UniqueProcess Process;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)] public string AppName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)] public string ServiceName;
            public uint ApplicationType, AppStatus, SessionId;
            [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
            IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
        private static extern uint GetLongPathNameW(string path, StringBuilder buffer, uint capacity);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        private static extern int RmStartSession(out uint session, uint flags, StringBuilder key);
        [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
        private static extern int RmRegisterResources(uint session, uint fileCount, string[] files,
            uint appCount, IntPtr apps, uint serviceCount, IntPtr services);
        [DllImport("rstrtmgr.dll")]
        private static extern int RmGetList(uint session, out uint needed, ref uint count,
            [In, Out] ProcessInfo[] processes, ref uint reasons);
        [DllImport("rstrtmgr.dll")]
        private static extern int RmEndSession(uint session);

        private static Dictionary<string, object> Map()
        {
            return new Dictionary<string, object>();
        }
        private static string Hash(string salt, string value)
        {
            using (SHA256 sha = SHA256.Create())
            {
                byte[] digest = sha.ComputeHash(Encoding.UTF8.GetBytes(salt + ":" + value));
                return BitConverter.ToString(digest, 0, 12).Replace("-", "").ToLowerInvariant();
            }
        }
        private static int HResult(int win32)
        {
            return win32 <= 0 ? win32 : unchecked((int)(0x80070000U | ((uint)win32 & 0xffffU)));
        }
        private static bool Missing(int status) { return status == 2 || status == 3; }

        private static string LocalPath(string path)
        {
            if (path == null || path.Length > 240 || !Regex.IsMatch(path, @"\A[A-Za-z]:[\\/]"))
                throw new ArgumentException();
            if (Regex.IsMatch(path.Substring(2), "[:*?\"<>|\\x00-\\x1f]")) throw new ArgumentException();
            foreach (string component in path.Substring(3).Split('\\', '/'))
                if (component == "." || component == ".." || component.EndsWith(".") || component.EndsWith(" "))
                    throw new ArgumentException();
            string full = Path.GetFullPath(path);
            return full.Length == 3 ? full : full.TrimEnd('\\', '/');
        }
        private static void PlainDirectories(string path)
        {
            string cursor = Path.GetPathRoot(path);
            FileAttributes attributes = File.GetAttributes(cursor);
            if ((attributes & FileAttributes.ReparsePoint) != 0) throw new UnauthorizedAccessException();
            foreach (string part in path.Substring(cursor.Length).Split('\\'))
            {
                if (part.Length == 0) continue;
                cursor = Path.Combine(cursor, part);
                attributes = File.GetAttributes(cursor);
                if ((attributes & FileAttributes.ReparsePoint) != 0 || (attributes & FileAttributes.Directory) == 0)
                    throw new UnauthorizedAccessException();
            }
        }

        private static string LongDirectoryPath(string path)
        {
            // Check every ancestor before resolving aliases and check the expanded
            // spelling again. GetLongPathNameW must never authorize a junction.
            PlainDirectories(path);
            StringBuilder expanded = new StringBuilder(241);
            uint length = GetLongPathNameW(path, expanded, (uint)expanded.Capacity);
            if (length == 0)
            {
                int status = Marshal.GetLastWin32Error();
                throw new COMException(null, status == 0 ? unchecked((int)0x80004005) : HResult(status));
            }
            if (length >= expanded.Capacity) throw new PathTooLongException();
            string normalized = LocalPath(expanded.ToString());
            PlainDirectories(normalized);
            return normalized;
        }

        public static Dictionary<string, object> Capture(string root, string allowedTempRoot, string salt)
        {
            Stopwatch clock = Stopwatch.StartNew();
            root = LocalPath(root);
            string suppliedAllowed = LocalPath(allowedTempRoot);
            string leaf = Path.GetFileName(root);
            if (!Regex.IsMatch(leaf, @"\Aocx-management-auth-[A-Za-z0-9]{6}\z") ||
                salt == null || !Regex.IsMatch(salt, @"\A[0-9a-fA-F]{64}\z")) throw new ArgumentException();
            string normalizedAllowed = LongDirectoryPath(suppliedAllowed);
            // Resolve only the existing parent: the fixture may already be gone.
            string normalizedRoot = LocalPath(Path.Combine(LongDirectoryPath(Path.GetDirectoryName(root)), leaf));
            string allowedPrefix = normalizedAllowed.TrimEnd('\\') + "\\";
            if (!normalizedRoot.StartsWith(allowedPrefix, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException();
            // Normalize for containment, but probe the supplied spelling so this
            // observer does not erase the short-name hypothesis being investigated.
            Dictionary<string, object> result = Map();
            List<Dictionary<string, object>> entries = new List<Dictionary<string, object>>();
            result["schemaVersion"] = 1;
            result["observerGap"] = false;
            result["truncated"] = false;
            result["inaccessible"] = false;
            result["rootMissing"] = false;
            result["observedRootSpellingChanged"] = !root.Equals(normalizedRoot, StringComparison.Ordinal);
            result["allowedSpellingChanged"] = !suppliedAllowed.Equals(normalizedAllowed, StringComparison.Ordinal);
            result["entries"] = entries;
            result["postErrorResidualSnapshot"] = true;
            result["historicalDeleteObserved"] = false;
            result["emptyOwnersInconclusive"] = true;
            result["directoryOwnersLimited"] = true;
            result["pathReplacementRacePossible"] = true;
            Queue<string> pending = new Queue<string>();
            pending.Enqueue(root);
            using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
            {
                while (pending.Count > 0 && entries.Count < MaxEntries)
                {
                    if (clock.ElapsedMilliseconds >= 4000) { result["truncated"] = true; break; }
                    string path = pending.Dequeue();
                    Dictionary<string, object> entry = Map();
                    string relative = path.Equals(root, StringComparison.OrdinalIgnoreCase) ? "." : path.Substring(root.Length + 1);
                    entry["id"] = Hash(salt, relative.Replace('\\', '/').ToLowerInvariant());
                    entries.Add(entry);
                    try
                    {
                        PlainDirectories(Path.GetDirectoryName(path));
                        uint attributes;
                        int metadataStatus = Inspect(path, salt, entry, out attributes);
                        if ((int)entry["deleteOpenWin32"] != 0) result["inaccessible"] = true;
                        if (path == root && Missing(metadataStatus)) result["rootMissing"] = true;
                        if (metadataStatus != 0) { result["inaccessible"] = true; continue; }
                        bool reparse = (attributes & Reparse) != 0;
                        entry["reparseSkipped"] = reparse;
                        if (reparse) { result["inaccessible"] = true; continue; }
                        ReadDacl(path, (attributes & DirectoryAttribute) != 0, identity, entry, result);
                        if (clock.ElapsedMilliseconds >= 4000) { result["truncated"] = true; break; }
                        ReadOwners(path, salt, entry, result);
                        if ((attributes & DirectoryAttribute) != 0)
                            EnqueueChildren(path, pending, entries.Count, result);
                    }
                    catch (Exception error)
                    {
                        entry["hresult"] = error.HResult;
                        result["inaccessible"] = true;
                    }
                }
            }
            if (pending.Count != 0) result["truncated"] = true;
            result["captureDurationMs"] = clock.ElapsedMilliseconds;
            return result;
        }

        private static int Inspect(string path, string salt, Dictionary<string, object> entry, out uint attributes)
        {
            // This requests DELETE permission but never sets a delete disposition.
            // Close before any metadata, DACL, or Restart Manager query.
            using (SafeFileHandle probe = CreateFileW(path, DeleteAccess, ShareAll, IntPtr.Zero,
                OpenExisting, NoFollowBackup, IntPtr.Zero))
            {
                int status = probe.IsInvalid ? Marshal.GetLastWin32Error() : 0;
                entry["deleteOpenWin32"] = status;
                entry["deleteOpenHresult"] = HResult(status);
            }
            attributes = 0;
            using (SafeFileHandle metadata = CreateFileW(path, ReadAttributes, ShareAll, IntPtr.Zero,
                OpenExisting, NoFollowBackup, IntPtr.Zero))
            {
                int status = metadata.IsInvalid ? Marshal.GetLastWin32Error() : 0;
                FileInfo info = new FileInfo();
                if (status == 0 && !GetFileInformationByHandle(metadata, out info)) status = Marshal.GetLastWin32Error();
                entry["metadataWin32"] = status;
                entry["metadataHresult"] = HResult(status);
                if (status != 0) return status;
                attributes = info.Attributes;
                entry["attributes"] = attributes;
                entry["fileIdentity"] = Hash(salt, "file:" + info.Volume.ToString("x8", CultureInfo.InvariantCulture) +
                    ":" + info.IndexHigh.ToString("x8", CultureInfo.InvariantCulture) + info.IndexLow.ToString("x8", CultureInfo.InvariantCulture));
                return 0;
            }
        }

        private static void EnqueueChildren(string path, Queue<string> pending, int collected, Dictionary<string, object> result)
        {
            PlainDirectories(path);
            // Streaming enumeration bounds both memory and the number of children read.
            using (IEnumerator<string> children = Directory.EnumerateFileSystemEntries(path).GetEnumerator())
            {
                while (children.MoveNext())
                {
                    if (collected + pending.Count >= MaxEntries) { result["truncated"] = true; break; }
                    pending.Enqueue(LocalPath(children.Current));
                }
            }
        }

        private static void ReadDacl(string path, bool directory, WindowsIdentity identity,
            Dictionary<string, object> entry, Dictionary<string, object> result)
        {
            try
            {
                PlainDirectories(directory ? path : Path.GetDirectoryName(path));
                if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                    throw new UnauthorizedAccessException();
                FileSystemSecurity security;
                if (directory) security = new DirectorySecurity(path, AccessControlSections.Access);
                else security = new FileSecurity(path, AccessControlSections.Access);
                RawSecurityDescriptor descriptor = new RawSecurityDescriptor(security.GetSecurityDescriptorBinaryForm(), 0);
                RawAcl acl = descriptor.DiscretionaryAcl;
                List<Dictionary<string, object>> aces = new List<Dictionary<string, object>>();
                entry["dacl"] = aces;
                entry["nullDacl"] = acl == null;
                if (acl == null) return;
                if (acl.Count > MaxAces) { entry["daclTruncated"] = true; result["truncated"] = true; }
                for (int i = 0; i < Math.Min(acl.Count, MaxAces); i++)
                {
                    GenericAce ace = acl[i];
                    KnownAce known = ace as KnownAce;
                    Dictionary<string, object> reduced = Map();
                    reduced["type"] = (int)ace.AceType;
                    reduced["mask"] = known == null ? (object)null : known.AccessMask;
                    reduced["inherited"] = (ace.AceFlags & AceFlags.Inherited) != 0;
                    string principal = "other";
                    if (known != null && known.SecurityIdentifier.Equals(identity.User)) principal = "current";
                    else if (known != null && identity.Groups != null)
                        foreach (IdentityReference group in identity.Groups)
                            if (known.SecurityIdentifier.Equals(group)) { principal = "group"; break; }
                    reduced["principalClass"] = principal;
                    aces.Add(reduced);
                }
            }
            catch (Exception error) { entry["daclHresult"] = error.HResult; result["inaccessible"] = true; }
        }

        private static void ReadOwners(string path, string salt, Dictionary<string, object> entry, Dictionary<string, object> result)
        {
            uint session;
            int status = RmStartSession(out session, 0, new StringBuilder(33));
            List<Dictionary<string, object>> owners = new List<Dictionary<string, object>>();
            entry["owners"] = owners;
            if (status != 0) { entry["rmHresult"] = HResult(status); result["inaccessible"] = true; return; }
            try
            {
                PlainDirectories(Path.GetDirectoryName(path));
                if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                    throw new UnauthorizedAccessException();
                status = RmRegisterResources(session, 1, new string[] { path }, 0, IntPtr.Zero, 0, IntPtr.Zero);
                uint needed = 0, count = 0, reasons = 0;
                if (status == 0) status = RmGetList(session, out needed, ref count, null, ref reasons);
                if (status == MoreData && needed <= MaxOwners)
                {
                    count = needed;
                    ProcessInfo[] processes = new ProcessInfo[(int)count];
                    status = RmGetList(session, out needed, ref count, processes, ref reasons);
                    if (status == 0)
                        for (int i = 0; i < Math.Min((int)count, processes.Length); i++)
                        {
                            Dictionary<string, object> owner = Map();
                            owner["processId"] = Hash(salt, "pid:" + processes[i].Process.Id.ToString(CultureInfo.InvariantCulture));
                            owners.Add(owner);
                        }
                }
                if (status == MoreData) { entry["ownersTruncated"] = true; result["truncated"] = true; }
                entry["rmHresult"] = HResult(status);
                if (status != 0) result["inaccessible"] = true;
            }
            finally
            {
                int endStatus = RmEndSession(session);
                entry["rmEndHresult"] = HResult(endStatus);
                if (endStatus != 0) result["inaccessible"] = true;
            }
        }
    }
}
