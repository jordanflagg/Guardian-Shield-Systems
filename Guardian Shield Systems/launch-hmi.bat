@echo off

set PIPELINE_DIR=C:\Users\JordanFlagg\OneDrive - Integrated ControlWorks, LLC\Documents\Projects\Guardian Shield Systems\Python FREECAD Pipeline

echo Starting Guardian Shield services...

start "Guardian API"              cmd /k ""%PIPELINE_DIR%\launch_api.bat""
start "Guardian Trigger Dispatch" cmd /k ""%PIPELINE_DIR%\launch_trigger_dispatch.bat""
start ""                          "%~dp0web-hmi\simple-version\index-industrial.html"
