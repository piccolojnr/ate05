# Windows startup crash analysis

ATE05 writes native startup stage markers to:

```text
%LOCALAPPDATA%\ATE05 POS\logs\startup.log
```

The log is appended and flushed after every stage so it remains useful after a
native crash. It records stages and safe outcome categories only. It must never
include OAuth tokens, passwords, recovery keys, certificate data, or other
credentials.

If the normal log directory cannot be opened, the logger tries
`%TEMP%\ATE05 POS\logs\startup.log`. Entries include time, process ID, application
version, and panic source locations without panic payloads. A panic hook does
not catch Windows native stack overflow; the last flushed stage and WER dump
remain the evidence for native failures.

## Matching a dump to symbols

Every Windows CI or release workflow run retains a crash-analysis CI artifact
named `ate05-windows-x64-crash-symbols-<commit>`. It contains the release
`ate05-pos.exe`, its application PDB, and `windows-symbols.txt` with the commit,
ref, compiler version, and SHA-256 hashes. Cargo release builds retain limited
debug information and do not strip symbols. The PDB is kept in CI for 90 days;
archive it with your release records before it expires. It is not added to the
installer or GitHub release assets.

1. Identify the release tag and commit used to create the installed executable.
2. Download the crash-symbol artifact from that commit's GitHub Actions run.
3. Compare the installed executable's SHA-256 with `exe_sha256` in
   `windows-symbols.txt`:

   ```powershell
   Get-FileHash "$env:LOCALAPPDATA\ATE05 POS\ate05-pos.exe" -Algorithm SHA256
   ```

4. Open the dump in WinDbg, add the extracted artifact directory to the symbol
   path, reload, and analyze:

   ```text
   .sympath+ C:\path\to\extracted\symbols
   .reload /f ate05-pos.exe
   lmvm ate05_pos
   !analyze -v
   ```

Confirm WinDbg loads the PDB without a signature/age mismatch: the executable's
CodeView debug record identifies the exact PDB by GUID and age. If loading fails,
use `!sym noisy` and `.reload /f` to inspect symbol diagnostics. Do not force
mismatched symbols. Keep the corresponding EXE available to WinDbg as well.

Do not use a PDB from a different commit or rebuild. Even identical source can
produce a different executable identity and unusable addresses.

RC.3 did not retain its application PDB. Symbols from a fixed rebuild cannot
symbolicate the RC.3 dump reliably.

## Startup overflow regression

`backup::sha256_file` previously allocated `[0u8; 1024 * 1024]` on the stack.
Startup invokes it through `setup -> block_on -> ensure_daily -> create ->
create_unencrypted` to checksum the SQLite snapshot, and backup verification
also uses it. A 1 MiB local allocation plus caller frames cannot fit the default
Windows main-thread stack. `__chkstk` probes the allocation and Windows raises
`0xc00000fd` when it cannot create another guard page. This allocation dates to
commit `0ddfd56`, before the explicit native credential backends.

The fix allocates the same-size streaming buffer directly on the heap using
`vec!`, preserving checksum and backup behavior. Avoid `Box::new([0u8; ...])`,
which may first construct the array on the stack. The focused Rust regression
hashes more than one chunk on a 256 KiB thread stack and verifies its SHA-256,
then checks an empty file.

An optimized Windows read-loop isolation reproduces `0xc00000fd` with the
original array and exits successfully with the heap buffer. This proves the
allocation mechanism; it does not substitute for testing the complete POS app.

## Validate the fixed application

Build the prepared changes without tagging or publishing. Run the resulting
Windows executable against a fresh test profile and an existing test profile,
including a profile with a daily backup already present. Confirm it remains
running for at least 30 seconds, the setup screen opens, and `startup.log` reaches
`setup completed` and `window/runtime startup completed`. Check the daily backup
can be verified/restored using test data and that disconnected or unavailable
Drive credentials do not prevent startup. Preserve a full WER dump and this log
if a native crash persists; use the PDB from that exact build.
