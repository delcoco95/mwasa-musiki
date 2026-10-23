@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Envoi du site Mwasa Musiki sur OVH

set "HOTE=ssh.cluster129.hosting.ovh.net"
set "COMPTE=mwasamv"

echo.
echo  ==============================================================
echo   Envoi du site Mwasa Musiki sur l'hebergement OVH (connexion chiffree SFTP)
echo  ==============================================================
echo.

where sftp >nul 2>nul
if errorlevel 1 (
  echo  L'outil "sftp" de Windows est introuvable.
  echo  Parametres Windows ^> Applications ^> Fonctionnalites facultatives ^> ajouter "Client OpenSSH".
  echo.
  pause
  exit /b 1
)
if not exist "deploy\installation.txt" (
  echo  Dossier "deploy" introuvable : lancez ce fichier depuis le dossier du projet.
  pause
  exit /b 1
)

echo  Que voulez-vous faire ?
echo.
echo   1 - Premiere installation : tout le site + le fichier .env
echo   2 - Mise a jour du programme seulement (admin, styles, scripts, photos du site)
echo       sans toucher aux textes, actualites et photos modifies depuis l'administration
echo.
set /p CHOIX="  Votre choix (1 ou 2) : "

echo.
echo  Le mot de passe demande est celui du compte FTP "%COMPTE%" (onglet FTP-SSH d'OVH).
echo  Rien ne s'affiche quand vous le tapez : c'est normal. Validez avec Entree.
echo  A la toute premiere connexion, tapez  yes  pour accepter le serveur OVH.
echo.

if "%CHOIX%"=="1" goto installation
if "%CHOIX%"=="2" goto miseajour
echo  Choix non reconnu.
pause
exit /b 1

:installation
if not exist ".env" (
  echo  Fichier .env introuvable dans ce dossier.
  pause
  exit /b 1
)
sftp %COMPTE%@%HOTE% < "deploy\installation.txt"
goto fin

:miseajour
sftp %COMPTE%@%HOTE% < "deploy\mise-a-jour.txt"
goto fin

:fin
echo.
if errorlevel 1 (
  echo  L'envoi a echoue. Verifiez le mot de passe FTP et votre connexion Internet, puis relancez.
) else (
  echo  Envoi termine. Les messages "mkdir ... failure" sont normaux (dossier deja present).
  echo  Ouvrez https://mwasamusiki.com
)
echo.
pause
