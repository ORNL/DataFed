#!/bin/bash
# credit to chatgpt for this script

# Check if there are no parameters
if [ $# -eq 0 ]; then
    echo "Usage: $0 VARIABLE1 [VARIABLE2 ...]"
    exit 1
fi

# Name of the output script
output_script="saved_build_args.sh"

# Create or overwrite the output script
echo "#!/bin/bash" > "$output_script"

# Loop through the provided variables and export them in the output script
for variable in "$@"; do
    value="${!variable}"
    if [ -n "$value" ]; then
        echo "export $variable=\"$value\"" >> "$output_script"
    else
        echo "# Warning: $variable is not set" >> "$output_script"
    fi
done

# Make the output script executable
chmod +x "$output_script"

echo "Export script '$output_script' has been created."
