Stop-Service postgresql-x64-16 -Force
Set-Service postgresql-x64-16 -StartupType Manual
Get-Service postgresql-x64-16 | Format-List Name, Status, StartType
