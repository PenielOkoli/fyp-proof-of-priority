// Merge this snippet into AcademicLedger.sol, then redeploy and regenerate
// contracts/AcademicLedger.json from the compiled ABI.
//
// This app currently uses string project IDs such as "DLT_Research2026".
// If your canonical contract has uint256 project IDs, change string calldata
// _projectId to uint256 _projectId and mapping(string => ...) to
// mapping(uint256 => ...).

mapping(string => string) public projectDisputeReasons;

event ProjectDisputeReasonUpdated(
    string indexed projectId,
    address indexed disputedBy,
    string reason,
    uint256 timestamp
);

// If your current function is already:
// disputeContribution(string,address,uint256,string)
// keep the signature and add the projectDisputeReasons assignment below.
function disputeContribution(
    string calldata _projectId,
    address _contributor,
    uint256 _timestamp,
    string calldata _reason
) external notFinalized(_projectId) {
    require(bytes(_reason).length > 0, "Dispute reason required");

    // Existing dispute validation should remain here, for example:
    // require(isAuthorized[_projectId][msg.sender] || projectAdmins[_projectId] == msg.sender, "Not authorized");
    // require(!projectDisputes[_projectId].isDisputed, "Project already disputed");
    // require(!hasDisputed[_projectId][msg.sender], "One dispute already used");
    // contributionDisputes[hash] = true;
    // projectDisputes[_projectId].isDisputed = true;
    // hasDisputed[_projectId][msg.sender] = true;

    projectDisputeReasons[_projectId] = _reason;

    emit ContributionDisputed(_projectId, _contributor, _timestamp, _reason);
    emit ProjectDisputeReasonUpdated(_projectId, msg.sender, _reason, block.timestamp);
}

// If you keep flagContributionAsDisputed as an admin compatibility path, persist
// the same project-level reason there too.
function flagContributionAsDisputed(
    string calldata _projectId,
    address _contributor,
    uint256 _timestamp,
    string calldata _reason
) external onlyProjectAdmin(_projectId) notFinalized(_projectId) {
    require(bytes(_reason).length > 0, "Dispute reason required");

    // Existing flag logic remains here.

    projectDisputeReasons[_projectId] = _reason;

    emit ContributionDisputed(_projectId, _contributor, _timestamp, _reason);
    emit ProjectDisputeReasonUpdated(_projectId, msg.sender, _reason, block.timestamp);
}

function getProjectDisputeReason(
    string calldata _projectId
) external view returns (string memory) {
    return projectDisputeReasons[_projectId];
}

function resolveDispute(
    string calldata _projectId
) external onlyProjectAdmin(_projectId) notFinalized(_projectId) {
    // Existing resolution/unfreeze logic remains here, for example:
    // require(projectDisputes[_projectId].isDisputed, "Project not disputed");
    // projectDisputes[_projectId].isDisputed = false;

    projectDisputeReasons[_projectId] = "";

    // Existing event emission remains here.
    // emit DisputeResolved(_projectId, msg.sender, block.timestamp);
}
