import sys

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python -m app.cli <command>")
        print("Команды: create-admin")
        sys.exit(1)

    command = sys.argv[1]

    if command == "create-admin":
        from app.cli.commands import create_admin
        create_admin()
    else:
        print(f"Неизвестная команда: {command}")
        sys.exit(1)
